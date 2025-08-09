import * as fs from 'fs/promises';
import * as path from 'path';
import markdownPdf from 'markdown-pdf';
import { ProcessedPage, CategoryGroup, ExportOptions } from '../types';
import { MarkdownMerger } from './merger';
import { sanitizeFilename } from '../utils/strings';
import { logger } from '../utils/logger';

export class PdfGenerator {
  private merger: MarkdownMerger;

  constructor() {
    this.merger = new MarkdownMerger();
  }

  async generateFromMarkdown(
    markdownPath: string,
    pdfPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      markdownPdf()
        .from(markdownPath)
        .to(pdfPath, (err: any) => {
          if (err) {
            logger.error(`Failed to generate PDF: ${err.message}`);
            reject(err);
          } else {
            logger.success(`Generated PDF: ${path.basename(pdfPath)}`);
            resolve();
          }
        });
    });
  }

  async generateCategoryPdfs(
    groups: CategoryGroup[],
    options: ExportOptions,
    onCategoryDone?: (group: CategoryGroup) => void
  ): Promise<void> {
    const tempDir = path.join(options.outputDir, '.temp');
    await this.ensureDir(options.outputDir);
    await this.ensureDir(tempDir);

    const bar = logger.createProgressBar(groups.length, 'PDF:');
    for (const group of groups) {
      const filename = `${sanitizeFilename(group.category)}`;
      const mdPath = path.join(tempDir, `${filename}.md`);
      const pdfPath = path.join(options.outputDir, `${filename}.pdf`);

      const content = this.generateCategoryMarkdown(group, options);
      await fs.writeFile(mdPath, content, 'utf-8');
      
      await this.generateFromMarkdown(mdPath, pdfPath);
      bar.increment(1, `${group.category}`);
      if (onCategoryDone) onCategoryDone(group);
    }
    bar.stop();

    await this.cleanupTemp(tempDir);
  }

  async generateAllPagesPdf(
    pages: ProcessedPage[],
    options: ExportOptions,
    filename: string = 'all_notes.pdf'
  ): Promise<void> {
    const tempDir = path.join(options.outputDir, '.temp');
    await this.ensureDir(options.outputDir);
    await this.ensureDir(tempDir);

    const mdPath = path.join(tempDir, 'all_notes.md');
    const pdfPath = path.join(options.outputDir, filename);

    const tempOptions = { ...options };
    await this.merger.mergeAll(pages, { ...tempOptions, outputDir: tempDir });
    
    await this.generateFromMarkdown(mdPath, pdfPath);
    await this.cleanupTemp(tempDir);
  }

  private generateCategoryMarkdown(
    group: CategoryGroup,
    options: ExportOptions
  ): string {
    const lines: string[] = [];
    
    lines.push(`# ${group.category}`);
    lines.push('');
    
    if (options.includeToc) {
      lines.push('## Table of Contents');
      lines.push('');
      for (const page of group.pages) {
        lines.push(`- ${page.title}`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    for (const page of group.pages) {
      lines.push(`## ${page.title}`);
      lines.push('');
      
      if (options.includeMetadata) {
        lines.push('**Metadata**');
        lines.push(`- Created: ${new Date(page.createdTime).toLocaleString()}`);
        lines.push(`- Last Edited: ${new Date(page.lastEditedTime).toLocaleString()}`);
        lines.push('');
      }
      
      lines.push(page.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  private async ensureDir(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async cleanupTemp(tempDir: string): Promise<void> {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`Failed to cleanup temp directory: ${tempDir}`);
    }
  }
}