export interface DatabaseConfig {
  alias: string;
  notionId: string;
  name?: string;
  description?: string;
}

export interface MultiDatabaseConfig {
  apiKey: string;
  databases: DatabaseConfig[];
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
  // Merge all exported pages into a single markdown file
  mergeAll?: boolean;
  // If true, keep only the latest version for pages that have versioned titles (e.g., "v2", "version 3.1")
  keepLatestVersions?: boolean;
  // Optional base name for the merged single-file output
  outputName?: string;
  // If true, append a YYYY-MM-DD date suffix to the merged filename
  timestamped?: boolean;
  // If true, prefix all exported files with YYYY-MM-DD timestamp
  prefixWithTimestamp?: boolean;
  // If true, prefix all exported files with database name
  prefixWithDatabaseName?: boolean;
  // Name of the database for file naming
  databaseName?: string;
  // Name of the Notion checkbox property that gates whether a page should be exported
  exportFlagPropertyName?: string;
  // Optional: Match your Notion view ordering by specifying a property and direction
  orderByPropertyName?: string;
  orderDirection?: 'ascending' | 'descending';
  // Optional: Desired order of categories as defined by Notion select option order
  categoryOrder?: string[];
}

export interface FetchPagesOptions {
  exportFlagPropertyName?: string;
  orderByPropertyName?: string;
  orderDirection?: 'ascending' | 'descending';
  onProgress?: (pagesFetched: number) => void;
}