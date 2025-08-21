import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { NotionConfig, ExportOptions } from '../types';
import { logger } from './logger';

export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), '.context-forge.json');
    dotenv.config();
  }

  async loadConfig(): Promise<{ notion: NotionConfig; export: ExportOptions } | null> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);
      logger.info('Loaded configuration from file');
      return config;
    } catch {
      logger.info('No configuration file found, using defaults');
      return null;
    }
  }

  async saveConfig(config: { notion: NotionConfig; export: ExportOptions }): Promise<void> {
    try {
      const configData = JSON.stringify(config, null, 2);
      await fs.writeFile(this.configPath, configData, 'utf-8');
      logger.success('Configuration saved to file');
    } catch (error) {
      logger.error('Failed to save configuration:', error);
    }
  }

  getNotionConfig(): NotionConfig | null {
    const apiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_DATABASE_ID;

    if (!apiKey || !databaseId) {
      return null;
    }

    return { apiKey, databaseId };
  }

  getDefaultExportOptions(): ExportOptions {
    return {
      format: 'markdown',
      outputDir: './output',
      mergeByCategory: true,
      keepLatestVersions: true,
      includeMetadata: true,
      includeToc: true,
      folderStructure: false,
      mergeAll: false,
      outputName: undefined,
      timestamped: false,
      exportFlagPropertyName: 'Export',
      orderByPropertyName: undefined,
      orderDirection: 'ascending',
    };
  }

  async createSampleConfig(): Promise<void> {
    const sampleConfig = {
      notion: {
        apiKey: 'your-notion-api-key',
        databaseId: 'your-database-id',
      },
      export: this.getDefaultExportOptions(),
    };

    const samplePath = path.join(process.cwd(), '.context-forge.sample.json');
    await fs.writeFile(samplePath, JSON.stringify(sampleConfig, null, 2), 'utf-8');
    logger.success('Created sample configuration file: .context-forge.sample.json');
  }

  async createEnvFile(): Promise<void> {
    const envContent = `# Notion API Configuration
NOTION_API_KEY=your-notion-api-key
NOTION_DATABASE_ID=your-database-id
`;

    const envPath = path.join(process.cwd(), '.env.example');
    await fs.writeFile(envPath, envContent, 'utf-8');
    logger.success('Created sample environment file: .env.example');
  }
}