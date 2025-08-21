import { ProcessedPage, CategoryGroup } from '../types';
import { sanitizeFilename } from '../utils/strings';
import { logger } from '../utils/logger';

export class ContentProcessor {
  /**
   * Keep only the highest version for pages that share the same base title.
   * Examples: "Investor Deck v2" vs "Investor Deck v4" → keep v4, drop others.
   * If a base title has any versioned pages, unversioned variants of the same
   * base title are dropped. Titles without version indicators are left as-is.
   */
  filterLatestVersions(pages: ProcessedPage[]): ProcessedPage[] {
    type Versioned = { page: ProcessedPage; versionParts: number[] | null; baseTitle: string };

    const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

    const parseTitle = (title: string): { baseTitle: string; versionParts: number[] | null } => {
      const trimmed = title.trim();
      // Match suffix forms like: "... v2", "... V 12", "... version 3.1", optionally with surrounding brackets
      const match = trimmed.match(/^(.*?)(?:[\s\-–—_\(\[]*)[vV](?:ersion)?\s*(\d+(?:\.\d+)*)\s*[\)\]]?\s*$/);
      if (!match) {
        return { baseTitle: trimmed, versionParts: null };
      }
      const baseRaw = match[1].trim().replace(/[\-–—_\(:]+$/,'').trim();
      const versionStr = match[2];
      const versionParts = versionStr.split('.').map(p => parseInt(p, 10)).map(n => (isNaN(n) ? 0 : n));
      return { baseTitle: baseRaw || trimmed, versionParts };
    };

    const groups = new Map<string, Versioned[]>();
    for (const page of pages) {
      const { baseTitle, versionParts } = parseTitle(page.title);
      const key = normalize(baseTitle);
      const list = groups.get(key) || [];
      list.push({ page, versionParts, baseTitle });
      groups.set(key, list);
    }

    const compareVersionParts = (a: number[], b: number[]): number => {
      const len = Math.max(a.length, b.length);
      for (let i = 0; i < len; i++) {
        const av = a[i] ?? 0;
        const bv = b[i] ?? 0;
        if (av !== bv) return av - bv;
      }
      return 0;
    };

    const result: ProcessedPage[] = [];
    let removed = 0;

    for (const [, list] of groups) {
      const withVersion = list.filter(item => item.versionParts !== null) as Array<Required<Versioned>>;
      if (withVersion.length === 0) {
        // No version info for this base title: keep all as-is
        result.push(...list.map(l => l.page));
        continue;
      }

      // Choose highest version; tie-breaker by lastEditedTime
      let best = withVersion[0];
      for (let i = 1; i < withVersion.length; i++) {
        const current = withVersion[i];
        const cmp = compareVersionParts(best.versionParts, current.versionParts);
        if (cmp < 0) {
          best = current;
        } else if (cmp === 0) {
          // Same version: prefer most recently edited
          if (new Date(current.page.lastEditedTime).getTime() > new Date(best.page.lastEditedTime).getTime()) {
            best = current;
          }
        }
      }

      // Count how many we drop (all others in the group)
      removed += list.length - 1;
      result.push(best.page);
    }

    if (removed > 0) {
      logger.info(`Deduplicated by version: kept latest for ${removed} older variants`);
    }
    return result;
  }
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