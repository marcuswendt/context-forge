import * as fs from 'fs/promises';
import * as path from 'path';
import { ProcessedPage, CategoryGroup, ExportOptions } from '../types';
import { ContentProcessor } from './processor';
import { logger } from '../utils/logger';

export class MarkdownMerger {
  private processor: ContentProcessor;

  constructor() {
    this.processor = new ContentProcessor();
  }

  async mergeByCategory(
    groups: CategoryGroup[],
    options: ExportOptions,
    onCategoryDone?: (group: CategoryGroup) => void
  ): Promise<void> {
    await this.ensureOutputDir(options.outputDir);

    const bar = logger.createProgressBar(groups.length, 'Markdown:');
    for (const group of groups) {
      const filename = `${this.processor.sanitizeFilename(group.category)}.md`;
      const filepath = path.join(options.outputDir, filename);
      
      const content = this.generateCategoryMarkdown(group, options);
      await fs.writeFile(filepath, content, 'utf-8');
      
      const subpageCount = group.pages.reduce((acc, p) => acc + this.extractSubpageHeadings(p.content).length, 0);
      const subpagesNote = subpageCount > 0 ? ` (+${subpageCount} subpages)` : '';
      logger.success(`Created ${filename} with ${group.pages.length} pages${subpagesNote}`);
      bar.increment(1, `${group.category}`);
      if (onCategoryDone) onCategoryDone(group);
    }
    bar.stop();
  }

  async mergeAll(
    pages: ProcessedPage[],
    options: ExportOptions,
    filename: string = 'all_notes.md'
  ): Promise<void> {
    await this.ensureOutputDir(options.outputDir);
    
    const filepath = path.join(options.outputDir, filename);
    const content = this.generateAllPagesMarkdown(pages, options);
    
    await fs.writeFile(filepath, content, 'utf-8');
    const totalSubpages = pages.reduce((acc, p) => acc + this.extractSubpageHeadings(p.content).length, 0);
    const subpagesNote = totalSubpages > 0 ? ` (+${totalSubpages} subpages)` : '';
    logger.success(`Created ${filename} with ${pages.length} pages${subpagesNote}`);
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
        const anchor = this.createAnchor(page.title);
        lines.push(`- [${page.title}](#${anchor})`);
        // Only include subpages as level-2 items. We detect subpages via the injected marker.
        const subpages = this.extractSubpageHeadings(page.content);
        for (const s of subpages) {
          lines.push(`  - [${s}](#${this.createAnchor(s)})`);
        }
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    for (const page of group.pages) {
      lines.push(this.generatePageMarkdown(page, options, 2));
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  private generateAllPagesMarkdown(
    pages: ProcessedPage[],
    options: ExportOptions
  ): string {
    const lines: string[] = [];
    const groups = this.processor.groupByCategory(pages);
    
    lines.push('# All Notes');
    lines.push('');
    
    if (options.includeToc) {
      lines.push('## Table of Contents');
      lines.push('');
      for (const group of groups) {
        const categoryAnchor = this.createAnchor(group.category);
        lines.push(`### [${group.category}](#${categoryAnchor})`);
        for (const page of group.pages) {
          const pageAnchor = this.createAnchor(page.title);
          lines.push(`  - [${page.title}](#${pageAnchor})`);
          const subpages = this.extractSubpageHeadings(page.content);
          for (const s of subpages) {
            lines.push(`    - [${s}](#${this.createAnchor(s)})`);
          }
        }
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }

    for (const group of groups) {
      lines.push(`## ${group.category}`);
      lines.push('');
      
      for (const page of group.pages) {
        lines.push(this.generatePageMarkdown(page, options, 3));
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private generatePageMarkdown(
    page: ProcessedPage,
    options: ExportOptions,
    headingLevel: number = 2
  ): string {
    const lines: string[] = [];
    const heading = '#'.repeat(headingLevel);
    
    lines.push(`${heading} ${page.title}`);
    lines.push('');
    
    if (options.includeMetadata) {
      lines.push('> **Metadata**');
      lines.push(`> - Created: ${new Date(page.createdTime).toLocaleString()}`);
      lines.push(`> - Last Edited: ${new Date(page.lastEditedTime).toLocaleString()}`);
      if (page.tags && page.tags.length > 0) {
        lines.push(`> - Tags: ${page.tags.join(', ')}`);
      }
      lines.push(`> - [View in Notion](${page.url})`);
      lines.push('');
    }
    
    lines.push(page.content);
    
    return lines.join('\n');
  }

  private createAnchor(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  private extractSubpageHeadings(markdown: string): string[] {
    // Subpages are rendered by notion service with a marker just before a level-3 heading
    // We collect only those headings as TOC level-2 entries
    if (!markdown || markdown.length === 0) return [];
    const result: string[] = [];
    const lines = markdown.split('\n');
    let inCodeFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inCodeFence = !inCodeFence;
        continue;
      }
      if (inCodeFence) continue;

      if (trimmed === '<!--subpage-->') {
        // Next non-empty line that is a heading becomes the subpage title
        let j = i + 1;
        while (j < lines.length && lines[j].trim().length === 0) j++;
        if (j < lines.length) {
          const m = lines[j].match(/^(#{1,6})\s+(.+?)\s*$/);
          if (m) {
            const text = m[2].trim();
            result.push(text);
          }
        }
      }
    }
    return result;
  }

  private async ensureOutputDir(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      logger.info(`Created output directory: ${dir}`);
    }
  }
}