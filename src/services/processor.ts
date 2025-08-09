import { ProcessedPage, CategoryGroup } from '../types';
import { logger } from '../utils/logger';

export class ContentProcessor {
  groupByCategory(pages: ProcessedPage[]): CategoryGroup[] {
    const groups = new Map<string, ProcessedPage[]>();

    for (const page of pages) {
      const category = page.category || 'Uncategorized';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(page);
    }

    const result: CategoryGroup[] = [];
    for (const [category, pages] of groups) {
      result.push({
        category,
        pages: pages.sort((a, b) => 
          new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
        ),
      });
    }

    logger.info(`Grouped ${pages.length} pages into ${result.length} categories`);
    return result.sort((a, b) => a.category.localeCompare(b.category));
  }

  filterEmptyPages(pages: ProcessedPage[]): ProcessedPage[] {
    const filtered = pages.filter(page => page.content.trim().length > 0);
    const removed = pages.length - filtered.length;
    
    if (removed > 0) {
      logger.warn(`Filtered out ${removed} empty pages`);
    }
    
    return filtered;
  }

  sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '_')
      .replace(/-+/g, '-')
      .replace(/_+/g, '_')
      .trim();
  }
}