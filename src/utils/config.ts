import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { ExportOptions, DatabaseConfig, MultiDatabaseConfig } from '../types';
import { logger } from './logger';

export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), '.context-forge.json');
    dotenv.config();
  }

  async loadMultiDatabaseConfig(): Promise<MultiDatabaseConfig | null> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      // Support both old and new config formats
      if (config.databases) {
        return config;
      } else if (config.notion) {
        // Convert old format to new format
        const newConfig: MultiDatabaseConfig = {
          apiKey: config.notion.apiKey,
          databases: [{
            alias: 'default',
            notionId: config.notion.databaseId,
            name: 'Default Database'
          }]
        };
        return newConfig;
      }
      
      return null;
    } catch {
      logger.info('No configuration file found');
      return null;
    }
  }

  async saveMultiDatabaseConfig(config: MultiDatabaseConfig): Promise<void> {
    try {
      const configData = JSON.stringify(config, null, 2);
      await fs.writeFile(this.configPath, configData, 'utf-8');
      logger.success('Configuration saved to file');
    } catch (error) {
      logger.error('Failed to save configuration:', error);
    }
  }

  async addDatabase(alias: string, notionId: string, name?: string, description?: string): Promise<void> {
    const config = await this.loadMultiDatabaseConfig();
    
    if (!config) {
      throw new Error('No configuration found. Please run "context-forge init" first.');
    }

    // Check if alias already exists
    const existingIndex = config.databases.findIndex(db => db.alias === alias);
    if (existingIndex !== -1) {
      // Update existing database
      config.databases[existingIndex] = { alias, notionId, name, description };
      logger.info(`Updated database "${alias}"`);
    } else {
      // Add new database
      config.databases.push({ alias, notionId, name, description });
      logger.info(`Added database "${alias}"`);
    }

    await this.saveMultiDatabaseConfig(config);
  }

  async removeDatabase(alias: string): Promise<void> {
    const config = await this.loadMultiDatabaseConfig();
    
    if (!config) {
      throw new Error('No configuration found');
    }

    const index = config.databases.findIndex(db => db.alias === alias);
    if (index === -1) {
      throw new Error(`Database "${alias}" not found`);
    }

    config.databases.splice(index, 1);

    await this.saveMultiDatabaseConfig(config);
    logger.info(`Removed database "${alias}"`);
  }

  async getDatabaseByAlias(alias: string): Promise<DatabaseConfig | null> {
    const config = await this.loadMultiDatabaseConfig();
    if (!config) return null;
    
    return config.databases.find(db => db.alias === alias) || null;
  }

  async getDatabaseByNotionId(notionId: string): Promise<DatabaseConfig | null> {
    const config = await this.loadMultiDatabaseConfig();
    if (!config) return null;
    
    return config.databases.find(db => db.notionId === notionId) || null;
  }

  async listDatabases(): Promise<DatabaseConfig[]> {
    const config = await this.loadMultiDatabaseConfig();
    return config?.databases || [];
  }

  async getDefaultDatabase(): Promise<DatabaseConfig | null> {
    const config = await this.loadMultiDatabaseConfig();
    if (!config || config.databases.length === 0) return null;
    
    // Automatically use the first database in the list as default
    return config.databases[0];
  }

  async setDefaultApiKey(apiKey: string): Promise<void> {
    let config = await this.loadMultiDatabaseConfig();
    if (!config) {
      // Create new config if none exists
      config = {
        apiKey,
        databases: [],
      };
    } else {
      config.apiKey = apiKey;
    }

    await this.saveMultiDatabaseConfig(config);
    logger.info('Default Notion API key set successfully');
  }

  getDefaultExportOptions(): ExportOptions {
    return {
      format: 'markdown',
      outputDir: './output',
      mergeByCategory: false, // Changed to false to combine all categories
      keepLatestVersions: true,
      includeMetadata: true,
      includeToc: true,
      folderStructure: false,
      mergeAll: true, // Changed to true to merge all pages into one file
      outputName: undefined,
      timestamped: false,
      prefixWithTimestamp: true, // Changed to true to prefix with timestamp
      prefixWithDatabaseName: true, // Changed to true to prefix with database name
      exportFlagPropertyName: 'Export',
      orderByPropertyName: undefined,
      orderDirection: 'ascending',
    };
  }
}