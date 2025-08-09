import { Client } from '@notionhq/client';
import { ProcessedPage } from '../types';
import { logger } from '../utils/logger';

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

    while (hasMore) {
      try {
        const response = await this.client.databases.query({
          database_id: this.databaseId,
          start_cursor: cursor,
        });

        for (const page of response.results) {
          if ('properties' in page) {
            const processed = await this.processPage(page);
            if (processed) {
              pages.push(processed);
            }
          }
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
      const content = await this.fetchPageContent(page.id);
      
      return {
        id: page.id,
        title: title || 'Untitled',
        category: category || 'Uncategorized',
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
    const allBlocks: any[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    // Paginate through all children blocks
    while (hasMore) {
      const response = await this.client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
      });

      allBlocks.push(...response.results);
      cursor = (response as any).next_cursor || undefined;
      hasMore = (response as any).has_more === true;
    }

    const contentParts: string[] = [];

    for (const block of allBlocks) {
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

      // For other blocks, render as plain text
      const text = this.extractBlockText(block);
      if (text) {
        contentParts.push(text);
      }
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
}