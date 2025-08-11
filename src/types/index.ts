export interface NotionConfig {
  apiKey: string;
  databaseId: string;
}

export interface ProcessedPage {
  id: string;
  title: string;
  category: string;
  tags?: string[];
  content: string;
  createdTime: string;
  lastEditedTime: string;
  url: string;
}

export interface CategoryGroup {
  category: string;
  pages: ProcessedPage[];
}

export interface ExportOptions {
  format: 'markdown' | 'pdf' | 'both';
  outputDir: string;
  mergeByCategory: boolean;
  includeMetadata: boolean;
  includeToc: boolean;
  folderStructure?: boolean;
  // Name of the Notion checkbox property that gates whether a page should be exported
  exportFlagPropertyName?: string;
  // Optional: Match your Notion view ordering by specifying a property and direction
  orderByPropertyName?: string;
  orderDirection?: 'ascending' | 'descending';
}

export interface FetchPagesOptions {
  exportFlagPropertyName?: string;
  orderByPropertyName?: string;
  orderDirection?: 'ascending' | 'descending';
  onProgress?: (pagesFetched: number) => void;
}