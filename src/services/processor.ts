import { ProcessedPage, CategoryGroup } from '../types';
import { sanitizeFilename } from '../utils/strings';
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
        // Preserve the original order from Notion by keeping pages as-added
        pages,
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
    return sanitizeFilename(name);
  }
}