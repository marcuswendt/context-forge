import { Client } from '@notionhq/client';
import { ProcessedPage, FetchPagesOptions } from '../types';
import { logger } from '../utils/logger';
import { createConcurrencyLimiter, retry } from '../utils/async';

export class NotionService {
  private client: Client;
  private objectId: string;
  private objectType: 'database' | 'page' | null = null;
  private cachedCategoryOrder: string[] | null = null;

  constructor(apiKey: string, objectId: string) {
    this.client = new Client({ auth: apiKey });
    this.objectId = objectId;
  }

  private async detectObjectType(): Promise<'database' | 'page'> {
    if (this.objectType) return this.objectType;
    
    try {
      // Try to retrieve as a database first
      await this.client.databases.retrieve({ database_id: this.objectId });
      this.objectType = 'database';
      logger.info('Detected object as a database');
      return 'database';
    } catch (error: any) {
      // Check if it's an authentication error
      if (error.code === 'unauthorized' || error.status === 401) {
        throw new Error('Invalid Notion API key. Please check your API key and try again.');
      }
      
      if (error.code === 'object_not_found' || error.status === 404) {
        // Try as a page
        try {
          await this.client.pages.retrieve({ page_id: this.objectId });
          this.objectType = 'page';
          logger.info('Detected object as a page');
          return 'page';
        } catch (pageError: any) {
          if (pageError.code === 'unauthorized' || pageError.status === 401) {
            throw new Error('Invalid Notion API key. Please check your API key and try again.');
          }
          throw new Error(`Object ID ${this.objectId} is neither a valid database nor page ID`);
        }
      }
      throw error;
    }
  }

  async fetchAllPages(
    exportFlagPropertyNameOrOptions?: string | FetchPagesOptions,
    onProgressCb?: (pagesFetched: number) => void
  ): Promise<ProcessedPage[]> {
    const objectType = await this.detectObjectType();
    
    if (objectType === 'page') {
      return this.fetchSinglePageWithChildren();
    } else {
      return this.fetchDatabasePages(exportFlagPropertyNameOrOptions, onProgressCb);
    }
  }

  private async fetchSinglePageWithChildren(): Promise<ProcessedPage[]> {
    logger.info('Fetching single page and its children...');
    
    try {
      // Fetch the main page
      const page = await this.client.pages.retrieve({ page_id: this.objectId });
      const processedPage = await this.processPage(page);
      
      if (!processedPage) {
        throw new Error('Failed to process main page');
      }

      // Fetch all child pages recursively
      const childPages = await this.fetchChildPages(this.objectId);
      
      // Combine main page with child pages
      const allPages = [processedPage, ...childPages];
      
      logger.info(`Fetched 1 main page and ${childPages.length} child pages`);
      return allPages;
    } catch (error) {
      logger.error('Error fetching single page:', error);
      throw error;
    }
  }

  private async fetchChildPages(parentPageId: string, depth: number = 0): Promise<ProcessedPage[]> {
    if (depth > 10) {
      logger.warn('Maximum recursion depth reached, stopping child page fetch');
      return [];
    }

    const childPages: ProcessedPage[] = [];
    
    try {
      const response = await this.client.blocks.children.list({
        block_id: parentPageId,
      });

      for (const block of response.results as any[]) {
        if (block.type === 'child_page' && block.child_page) {
          try {
            // Fetch the child page details
            const childPage = await this.client.pages.retrieve({ page_id: block.id });
            const processedChild = await this.processPage(childPage);
            
            if (processedChild) {
              // Recursively fetch children of this child page
              const grandChildren = await this.fetchChildPages(block.id, depth + 1);
              childPages.push(processedChild, ...grandChildren);
            }
          } catch (error) {
            logger.warn(`Failed to fetch child page ${block.id}:`, error);
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to fetch children for page ${parentPageId}:`, error);
    }

    return childPages;
  }

  private async fetchDatabasePages(
    exportFlagPropertyNameOrOptions?: string | FetchPagesOptions,
    onProgressCb?: (pagesFetched: number) => void
  ): Promise<ProcessedPage[]> {
    const pages: ProcessedPage[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    logger.debug('Starting Notion database fetch loop...');

    // Normalize options
    let exportFlagPropertyName: string | undefined;
    let orderByPropertyName: string | undefined;
    let orderDirection: 'ascending' | 'descending' | undefined;
    let onProgress: ((pagesFetched: number) => void) | undefined;
    if (typeof exportFlagPropertyNameOrOptions === 'string' || exportFlagPropertyNameOrOptions === undefined) {
      exportFlagPropertyName = exportFlagPropertyNameOrOptions as string | undefined;
      onProgress = onProgressCb;
    } else {
      exportFlagPropertyName = exportFlagPropertyNameOrOptions.exportFlagPropertyName;
      orderByPropertyName = exportFlagPropertyNameOrOptions.orderByPropertyName;
      orderDirection = exportFlagPropertyNameOrOptions.orderDirection;
      onProgress = exportFlagPropertyNameOrOptions.onProgress ?? onProgressCb;
    }

    const limit = createConcurrencyLimiter(5);

    while (hasMore) {
      try {
        const response = await retry(() => this.client.databases.query({
          database_id: this.objectId,
          start_cursor: cursor,
          sorts: orderByPropertyName
            ? [
                {
                  property: orderByPropertyName,
                  direction: orderDirection || 'ascending',
                } as any,
              ]
            : undefined,
        }), {
          shouldRetry: (err: any) => {
            const code = err?.status || err?.code;
            return code === 429 || (typeof code === 'number' && code >= 500);
          }
        });

        const processedBatch = await Promise.all(
          response.results
            .filter((page: any) => 'properties' in page)
            .filter((page: any) => this.isExportEnabled((page as any).properties, exportFlagPropertyName))
            .map((page: any) => limit(() => this.processPage(page)))
        );

        for (const p of processedBatch) {
          if (p) pages.push(p);
        }

        cursor = response.next_cursor || undefined;
        hasMore = response.has_more;
        
        if (onProgress) onProgress(pages.length);
        logger.debug(`Fetched ${pages.length} pages so far...`);
      } catch (error) {
        logger.error('Error fetching pages:', error);
        throw error;
      }
    }

    logger.info(`Fetched ${pages.length} pages in total`);
    return pages;
  }

  /**
   * Retrieve the database schema and infer the order of categories from the first
   * matching select or multi-select property among common names (e.g., Category, Tags, Type).
   * This reflects the user-defined option order in Notion.
   */
  async fetchCategoryOrder(): Promise<string[] | null> {
    if (this.cachedCategoryOrder) return this.cachedCategoryOrder;
    try {
      const db: any = await this.client.databases.retrieve({ database_id: this.objectId });
      const candidateProps = ['Category', 'Tags', 'Type', 'category', 'tags', 'type'];
      for (const key of candidateProps) {
        const prop = db?.properties?.[key];
        if (!prop) continue;
        if (prop.type === 'select' && Array.isArray(prop.select?.options)) {
          this.cachedCategoryOrder = prop.select.options.map((o: any) => o.name).filter(Boolean);
          return this.cachedCategoryOrder;
        }
        if (prop.type === 'multi_select' && Array.isArray(prop.multi_select?.options)) {
          this.cachedCategoryOrder = prop.multi_select.options.map((o: any) => o.name).filter(Boolean);
          return this.cachedCategoryOrder;
        }
      }
      return null;
    } catch (err) {
      logger.warn('Failed to fetch category order from Notion schema');
      return null;
    }
  }

  private isExportEnabled(properties: any, exportFlagPropertyName?: string): boolean {
    if (!exportFlagPropertyName) return true;
    const prop = properties?.[exportFlagPropertyName];
    if (!prop) return false;
    if (typeof prop?.checkbox === 'boolean') return prop.checkbox === true;
    if (prop?.type === 'checkbox' && typeof prop?.checkbox === 'boolean') return prop.checkbox === true;
    return false;
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