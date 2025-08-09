import { Client } from '@notionhq/client';
import { ProcessedPage } from '../types';
import { logger } from '../utils/logger';
import { createConcurrencyLimiter, retry } from '../utils/async';

export class NotionService {
  private client: Client;
  private databaseId: string;

  constructor(apiKey: string, databaseId: string) {
    this.client = new Client({ auth: apiKey });
    this.databaseId = databaseId;
  }

  async fetchAllPages(): Promise<ProcessedPage[]> {
    const pages: ProcessedPage[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    logger.info('Fetching pages from Notion database...');

    const limit = createConcurrencyLimiter(5);

    while (hasMore) {
      try {
        const response = await retry(() => this.client.databases.query({
          database_id: this.databaseId,
          start_cursor: cursor,
        }), {
          shouldRetry: (err: any) => {
            const code = err?.status || err?.code;
            return code === 429 || (typeof code === 'number' && code >= 500);
          }
        });

        const processedBatch = await Promise.all(
          response.results
            .filter((page: any) => 'properties' in page)
            .map((page: any) => limit(() => this.processPage(page)))
        );

        for (const p of processedBatch) {
          if (p) pages.push(p);
        }

        cursor = response.next_cursor || undefined;
        hasMore = response.has_more;
        
        logger.info(`Fetched ${pages.length} pages so far...`);
      } catch (error) {
        logger.error('Error fetching pages:', error);
        throw error;
      }
    }

    logger.success(`Successfully fetched ${pages.length} pages`);
    return pages;
  }

  private async processPage(page: any): Promise<ProcessedPage | null> {
    try {
      const title = this.extractTitle(page.properties);
      const category = this.extractCategory(page.properties);
      const tags = this.extractTags(page.properties);
      const content = await this.fetchPageContent(page.id);
      
      return {
        id: page.id,
        title: title || 'Untitled',
        category: category || 'Uncategorized',
        tags,
        content: content,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        url: page.url,
      };
    } catch (error) {
      logger.warn(`Failed to process page ${page.id}:`, error);
      return null;
    }
  }

  private extractTitle(properties: any): string {
    const titleProps = ['Title', 'Name', 'title', 'name'];
    
    for (const prop of titleProps) {
      if (properties[prop]?.title) {
        return properties[prop].title.map((t: any) => t.plain_text).join('');
      }
      if (properties[prop]?.rich_text) {
        return properties[prop].rich_text.map((t: any) => t.plain_text).join('');
      }
    }
    
    return '';
  }

  private extractCategory(properties: any): string {
    const categoryProps = ['Category', 'Tags', 'Type', 'category', 'tags', 'type'];
    
    for (const prop of categoryProps) {
      if (properties[prop]?.select?.name) {
        return properties[prop].select.name;
      }
      if (properties[prop]?.multi_select?.length > 0) {
        return properties[prop].multi_select[0].name;
      }
    }
    
    return 'Uncategorized';
  }

  private extractTags(properties: any): string[] | undefined {
    const tagProps = ['Tags', 'tags', 'Label', 'labels', 'Tag', 'tag'];
    for (const prop of tagProps) {
      const property = properties[prop];
      if (!property) continue;
      if (Array.isArray(property?.multi_select) && property.multi_select.length > 0) {
        return property.multi_select.map((t: any) => t.name).filter(Boolean);
      }
      if (property?.select?.name) {
        return [property.select.name];
      }
    }
    return undefined;
  }

  private async fetchPageContent(pageId: string): Promise<string> {
    try {
      // Start rendering the page content. We use heading level 3 for first-level child chapters
      // because the page itself will be rendered with a heading by the merger.
      return await this.renderPageBlocks(pageId, 3, 0);
    } catch (error) {
      logger.warn(`Failed to fetch content for page ${pageId}`);
      return '';
    }
  }

  private async renderPageBlocks(
    blockId: string,
    headingDepth: number,
    childDepth: number
  ): Promise<string> {
    const contentParts: string[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await retry(() => this.client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
      }), {
        shouldRetry: (err: any) => {
          const code = err?.status || err?.code;
          return code === 429 || (typeof code === 'number' && code >= 500);
        }
      });

      for (const block of response.results as any[]) {
      // Handle subpages (child_page) as chapters
      if (block.type === 'child_page' && block.child_page) {
        const childTitle: string = block.child_page.title || 'Untitled';
        const headingPrefix = '#'.repeat(Math.min(6, Math.max(1, headingDepth)));

        // Insert a hidden marker so downstream TOC can pick only subpages (level 2)
        if (childDepth === 0) {
          contentParts.push('<!--subpage-->');
        }
        contentParts.push(`${headingPrefix} ${childTitle}`);
        contentParts.push('');

        try {
          // The child page's content can be fetched by listing children of the child block id
          const childContent = await this.renderPageBlocks(
            block.id,
            Math.min(6, headingDepth + 1),
            childDepth + 1
          );
          if (childContent.trim().length > 0) {
            contentParts.push(childContent);
          }
        } catch (err) {
          logger.warn(`Failed to render child page ${block.id}: ${childTitle}`);
        }

        contentParts.push('');
          continue;
        }

        // For other blocks, render text and optionally include children
        const baseText = this.extractBlockText(block);

        // If the block has children, render them and combine appropriately
        if (block.has_children) {
          let childrenText = '';
          try {
            childrenText = await this.renderPageBlocks(
              block.id,
              headingDepth,
              childDepth + 1
            );
          } catch (err) {
            logger.warn(`Failed to render children for block ${block.id} (${block.type})`);
          }

          // Special formatting for quotes: wrap combined content in Markdown blockquote
          if (block.type === 'quote') {
            const combined = [baseText, childrenText].filter(Boolean).join('\n\n');
            const quoted = this.formatAsBlockQuote(combined);
            if (quoted) contentParts.push(quoted);
          } else {
            const combined = [baseText, childrenText].filter(Boolean).join('\n\n');
            if (combined.trim().length > 0) contentParts.push(combined);
          }
        } else {
          // No children: push plain text, with quote formatting if needed
          if (block.type === 'quote') {
            const quoted = this.formatAsBlockQuote(baseText);
            if (quoted) contentParts.push(quoted);
          } else if (baseText) {
            contentParts.push(baseText);
          }
        }
      }

      cursor = (response as any).next_cursor || undefined;
      hasMore = (response as any).has_more === true;
    }

    return contentParts.join('\n\n');
  }

  private extractBlockText(block: any): string {
    const type = block.type;
    const blockData = block[type];

    if (!blockData) return '';

    switch (type) {
      case 'paragraph':
      case 'heading_1':
      case 'heading_2':
      case 'heading_3':
      case 'quote':
      case 'callout':
        const prefix = type.startsWith('heading') ? '#'.repeat(parseInt(type.split('_')[1])) + ' ' : '';
        const text = blockData.rich_text?.map((t: any) => t.plain_text).join('') || '';
        return prefix + text;
      
      case 'bulleted_list_item':
        return '- ' + (blockData.rich_text?.map((t: any) => t.plain_text).join('') || '');
      
      case 'numbered_list_item':
        return '1. ' + (blockData.rich_text?.map((t: any) => t.plain_text).join('') || '');
      
      case 'code':
        const code = blockData.rich_text?.map((t: any) => t.plain_text).join('') || '';
        const language = blockData.language || '';
        return `\`\`\`${language}\n${code}\n\`\`\``;
      
      case 'divider':
        return '---';
      
      default:
        return '';
    }
  }

  private formatAsBlockQuote(text: string): string {
    if (!text || text.trim().length === 0) return '';
    const lines = text.split(/\r?\n/);
    const quotedLines = lines.map(line => {
      if (line.trim().length === 0) {
        return '>';
      }
      return `> ${line}`;
    });
    return quotedLines.join('\n');
  }
}