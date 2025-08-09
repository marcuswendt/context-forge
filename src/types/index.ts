export interface NotionConfig {
  apiKey: string;
  databaseId: string;
}

export interface ProcessedPage {
  id: string;
  title: string;
  category: string;
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
}