import * as fs from 'fs/promises';
import * as path from 'path';
import { ProcessedPage, CategoryGroup, ExportOptions } from '../types';
import { ContentProcessor } from './processor';
import { logger } from '../utils/logger';
import { sanitizeFilename } from '../utils/strings';

export class MarkdownMerger {
  private processor: ContentProcessor;

  constructor() {
    this.processor = new ContentProcessor();
  }

  async exportAsFolderStructure(
    groups: CategoryGroup[],
    options: ExportOptions,
    onCategoryDone?: (group: CategoryGroup) => void
  ): Promise<void> {
    await this.ensureOutputDir(options.outputDir);
    for (const group of groups) {
      const categoryDir = path.join(options.outputDir, sanitizeFilename(group.category));
      await this.ensureDir(categoryDir);

      for (const page of group.pages) {
        await this.writePageAsFolder(categoryDir, page, options);
      }

      if (onCategoryDone) onCategoryDone(group);
    }
  }

  async mergeByCategory(
    groups: CategoryGroup[],
    options: ExportOptions,
    onCategoryDone?: (group: CategoryGroup) => void
  ): Promise<void> {
    await this.ensureOutputDir(options.outputDir);
    for (const group of groups) {
      const filename = `${sanitizeFilename(group.category)}.md`;
      const filepath = path.join(options.outputDir, filename);
      
      const content = this.generateCategoryMarkdown(group, options);
      await fs.writeFile(filepath, content, 'utf-8');
      
      const subpageCount = group.pages.reduce((acc, p) => {
        const filtered = this.filterSubpagesInMarkdown(p.content, options);
        return acc + this.extractSubpageHeadings(filtered).length;
      }, 0);
      const subpagesNote = subpageCount > 0 ? ` (+${subpageCount} subpages)` : '';
      logger.info(`Created ${filename} with ${group.pages.length} pages${subpagesNote}`);
      if (onCategoryDone) onCategoryDone(group);
    }
  }

  async mergeAll(
    pages: ProcessedPage[],
    options: ExportOptions,
    filename: string = 'all_notes.md'
  ): Promise<void> {
    await this.ensureOutputDir(options.outputDir);

    // Determine final filename based on options
    let baseName = options.outputName && options.outputName.trim().length > 0
      ? sanitizeFilename(options.outputName.trim())
      : filename.replace(/\.md$/i, '');
    if (options.timestamped) {
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      baseName = `${baseName}-${yyyy}-${mm}-${dd}`;
    }
    const finalFilename = `${baseName}.md`;
    const filepath = path.join(options.outputDir, finalFilename);
    const content = this.generateAllPagesMarkdown(pages, options);
    
    await fs.writeFile(filepath, content, 'utf-8');
    const totalSubpages = pages.reduce((acc, p) => {
      const filtered = this.filterSubpagesInMarkdown(p.content, options);
      return acc + this.extractSubpageHeadings(filtered).length;
    }, 0);
    const subpagesNote = totalSubpages > 0 ? ` (+${totalSubpages} subpages)` : '';
    logger.success(`Created ${finalFilename} with ${pages.length} pages${subpagesNote}`);
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
        // Only include subpages as level-2 items. Use filtered content to avoid listing removed versions.
        const filtered = this.filterSubpagesInMarkdown(page.content, options);
        const subpages = this.extractSubpageHeadings(filtered);
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
    const groups = this.processor.groupByCategory(pages, options.categoryOrder);
    
    let documentTitle = options.outputName && options.outputName.trim().length > 0
      ? options.outputName.trim()
      : 'All Notes';
    if (options.timestamped) {
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      documentTitle = `${documentTitle} - ${yyyy}-${mm}-${dd}`;
    }
    lines.push(`# ${documentTitle}`);
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
          const filtered = this.filterSubpagesInMarkdown(page.content, options);
          const subpages = this.extractSubpageHeadings(filtered);
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
    
    const filteredContent = this.filterSubpagesInMarkdown(page.content, options);
    lines.push(filteredContent);
    
    return lines.join('\n');
  }

  private splitPageIntoMainAndSubpages(markdown: string): { main: string; subpages: { title: string; content: string }[] } {
    if (!markdown || markdown.trim().length === 0) {
      return { main: '', subpages: [] };
    }

    const lines = markdown.split('\n');
    const mainLines: string[] = [];
    const subpages: { title: string; content: string }[] = [];

    let i = 0;
    let inCode = false;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inCode = !inCode;
        mainLines.push(line);
        i++;
        continue;
      }
      if (inCode) {
        mainLines.push(line);
        i++;
        continue;
      }

      if (trimmed === '<!--subpage-->') {
        // Find the heading line
        let j = i + 1;
        while (j < lines.length && lines[j].trim().length === 0) j++;
        if (j < lines.length) {
          const headingMatch = lines[j].match(/^(#{1,6})\s+(.+?)\s*$/);
          if (headingMatch) {
            const title = headingMatch[2].trim();
            // Collect until next subpage marker or EOF
            let k = j + 1;
            const buf: string[] = [lines[j]]; // include heading
            let localInCode = false;
            while (k < lines.length) {
              const l = lines[k];
              const t = l.trim();
              if (t.startsWith('```')) localInCode = !localInCode;
              if (!localInCode && t === '<!--subpage-->') break;
              buf.push(l);
              k++;
            }
            subpages.push({ title, content: buf.join('\n') });
            i = k; // continue after collected block
            continue;
          }
        }
      }

      mainLines.push(line);
      i++;
    }

    return { main: mainLines.join('\n'), subpages };
  }

  private async writePageAsFolder(baseDir: string, page: ProcessedPage, options: ExportOptions): Promise<void> {
    const { main, subpages } = this.splitPageIntoMainAndSubpages(page.content);
    const filteredSubpages = options.keepLatestVersions ? this.filterSubpageEntries(subpages) : subpages;

    // Header (used for either index.md or single file)
    const headerLines: string[] = [];
    headerLines.push(`# ${page.title}`);
    headerLines.push('');
    if (options.includeMetadata) {
      headerLines.push('> **Metadata**');
      headerLines.push(`> - Created: ${new Date(page.createdTime).toLocaleString()}`);
      headerLines.push(`> - Last Edited: ${new Date(page.lastEditedTime).toLocaleString()}`);
      if (page.tags && page.tags.length > 0) {
        headerLines.push(`> - Tags: ${page.tags.join(', ')}`);
      }
      headerLines.push(`> - [View in Notion](${page.url})`);
      headerLines.push('');
    }

    const combined = [headerLines.join('\n'), main].filter(Boolean).join('\n');

    // If there are no subpages after filtering, write a single file in the category folder
    if (filteredSubpages.length === 0) {
      const fileName = `${sanitizeFilename(page.title) || 'page'}.md`;
      await fs.writeFile(path.join(baseDir, fileName), combined, 'utf-8');
      return;
    }

    // Otherwise, create a folder for the page and write index + subpages
    const pageDir = path.join(baseDir, sanitizeFilename(page.title));
    await this.ensureDir(pageDir);
    await fs.writeFile(path.join(pageDir, 'index.md'), combined, 'utf-8');

    for (const sub of filteredSubpages) {
      const fileName = `${sanitizeFilename(sub.title) || 'subpage'}.md`;
      await fs.writeFile(path.join(pageDir, fileName), sub.content, 'utf-8');
    }
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

  private filterSubpagesInMarkdown(markdown: string, options: ExportOptions): string {
    if (!options.keepLatestVersions) return markdown;
    if (!markdown || markdown.trim().length === 0) return markdown;

    const lines = markdown.split('\n');
    type Block = { title: string; start: number; end: number };
    const blocks: Block[] = [];

    let i = 0;
    let inCode = false;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inCode = !inCode;
        i++;
        continue;
      }
      if (inCode) {
        i++;
        continue;
      }
      if (trimmed === '<!--subpage-->') {
        // heading follows after optional blank lines
        let j = i + 1;
        while (j < lines.length && lines[j].trim().length === 0) j++;
        if (j < lines.length) {
          const m = lines[j].match(/^(#{1,6})\s+(.+?)\s*$/);
          if (m) {
            const title = m[2].trim();
            // collect until next marker or EOF
            let k = j + 1;
            let localInCode = false;
            while (k < lines.length) {
              const l = lines[k];
              const t = l.trim();
              if (t.startsWith('```')) localInCode = !localInCode;
              if (!localInCode && t === '<!--subpage-->') break;
              k++;
            }
            blocks.push({ title, start: i, end: k - 1 });
            i = k;
            continue;
          }
        }
      }
      i++;
    }

    if (blocks.length === 0) return markdown;

    // Group by base title and determine which to keep
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const groups = new Map<string, Array<{ block: Block; version: number[] | null; base: string }>>();
    for (const b of blocks) {
      const { baseTitle, versionParts } = this.parseVersionFromTitle(b.title);
      const key = normalize(baseTitle);
      const list = groups.get(key) || [];
      list.push({ block: b, version: versionParts, base: baseTitle });
      groups.set(key, list);
    }

    const compareVersionParts = (a: number[], b: number[]): number => {
      const len = Math.max(a.length, b.length);
      for (let idx = 0; idx < len; idx++) {
        const av = a[idx] ?? 0;
        const bv = b[idx] ?? 0;
        if (av !== bv) return av - bv;
      }
      return 0;
    };

    const toRemove: Set<number> = new Set(); // store line indices to remove
    for (const [, list] of groups) {
      const withVersion = list.filter(item => item.version !== null) as Array<{ block: Block; version: number[]; base: string }>;
      if (withVersion.length === 0) {
        continue; // keep all unversioned if none has version
      }
      // keep only the highest version; remove others including any unversioned in same group
      let best = withVersion[0];
      for (let idx = 1; idx < withVersion.length; idx++) {
        const cur = withVersion[idx];
        if (compareVersionParts(best.version, cur.version) < 0) best = cur;
      }
      for (const item of list) {
        const isBest = item.block.start === best.block.start && item.block.end === best.block.end;
        if (!isBest) {
          for (let l = item.block.start; l <= item.block.end; l++) toRemove.add(l);
        }
      }
    }

    if (toRemove.size === 0) return markdown;
    const kept: string[] = [];
    for (let idx = 0; idx < lines.length; idx++) {
      if (!toRemove.has(idx)) kept.push(lines[idx]);
    }
    return kept.join('\n');
  }

  private parseVersionFromTitle(title: string): { baseTitle: string; versionParts: number[] | null } {
    const trimmed = title.trim();
    const re = /\b(?:v(?:ersion)?|ver)\s*(\d+(?:\.\d+)*)\b/ig;
    let lastMatch: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(trimmed)) !== null) lastMatch = m;
    if (!lastMatch) return { baseTitle: trimmed, versionParts: null };
    const matchIndex = lastMatch.index;
    const baseRaw = trimmed.slice(0, matchIndex).trim().replace(/[\-–—_:()\[\]\s]+$/,'').trim();
    const versionStr = lastMatch[1];
    const versionParts = versionStr.split('.').map(p => parseInt(p, 10)).map(n => (isNaN(n) ? 0 : n));
    return { baseTitle: baseRaw || trimmed, versionParts };
  }

  private filterSubpageEntries(subpages: { title: string; content: string }[]): { title: string; content: string }[] {
    if (!subpages || subpages.length === 0) return subpages;
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const groups = new Map<string, Array<{ idx: number; title: string; content: string; version: number[] | null; base: string }>>();
    for (let i = 0; i < subpages.length; i++) {
      const s = subpages[i];
      const { baseTitle, versionParts } = this.parseVersionFromTitle(s.title);
      const key = normalize(baseTitle);
      const list = groups.get(key) || [];
      list.push({ idx: i, title: s.title, content: s.content, version: versionParts, base: baseTitle });
      groups.set(key, list);
    }
    const compareVersionParts = (a: number[], b: number[]): number => {
      const len = Math.max(a.length, b.length);
      for (let idx = 0; idx < len; idx++) {
        const av = a[idx] ?? 0;
        const bv = b[idx] ?? 0;
        if (av !== bv) return av - bv;
      }
      return 0;
    };
    const keep = new Set<number>();
    for (const [, list] of groups) {
      const withVersion = list.filter(item => item.version !== null) as Array<{ idx: number; title: string; content: string; version: number[]; base: string }>;
      if (withVersion.length === 0) {
        for (const item of list) keep.add(item.idx);
      } else {
        let best = withVersion[0];
        for (let idx = 1; idx < withVersion.length; idx++) {
          const cur = withVersion[idx];
          if (compareVersionParts(best.version, cur.version) < 0) best = cur;
        }
        keep.add(best.idx);
      }
    }
    return subpages.filter((_, idx) => keep.has(idx));
  }

  private async ensureOutputDir(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      logger.info(`Created output directory: ${dir}`);
    }
  }

  private async ensureDir(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}