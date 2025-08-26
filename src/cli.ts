#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import { NotionService } from './services/notion';
import { ContentProcessor } from './services/processor';
import { MarkdownMerger } from './services/merger';
import { PdfGenerator } from './services/pdf';
import { ConfigManager } from './utils/config';
import { logger } from './utils/logger';
import { ExportOptions, DatabaseConfig } from './types';

const program = new Command();

// Shared database resolution logic
async function resolveDatabase(configManager: ConfigManager, databaseArg: string, overrideApiKey?: string): Promise<{ databaseId: string; apiKey: string; dbConfig?: DatabaseConfig }> {
  let databaseId: string;
  let apiKey: string;
  let dbConfig: DatabaseConfig | undefined;
  
  // First try to find by alias
  const aliasConfig = await configManager.getDatabaseByAlias(databaseArg);
  if (aliasConfig) {
    databaseId = aliasConfig.notionId;
    dbConfig = aliasConfig;
    logger.info(`Using database "${databaseArg}" (${aliasConfig.name || aliasConfig.alias})`);
  } else {
    // Check if it's a direct Notion ID
    const dbByNotionId = await configManager.getDatabaseByNotionId(databaseArg);
    if (dbByNotionId) {
      databaseId = databaseArg;
      dbConfig = dbByNotionId;
      logger.info(`Using database "${databaseArg}" (${dbByNotionId.name || dbByNotionId.alias})`);
    } else {
      // Assume it's a direct Notion ID
      databaseId = databaseArg;
      logger.info('Using provided Notion ID directly');
    }
  }

  // Get API key from override, config, or environment (in order of priority)
  if (overrideApiKey) {
    apiKey = overrideApiKey;
    logger.info('Using API key from command line option');
  } else {
    const multiConfig = await configManager.loadMultiDatabaseConfig();
    if (multiConfig?.apiKey) {
      apiKey = multiConfig.apiKey;
      logger.info('Using API key from configuration file');
    } else {
      apiKey = process.env.NOTION_API_KEY || '';
      if (apiKey) {
        logger.info('Using API key from environment variable');
      }
    }
  }

  if (!apiKey) {
    throw new Error('Notion API key is required. Set it via environment variable NOTION_API_KEY, config file, or --api-key option');
  }

  if (!databaseId) {
    throw new Error('Database ID is required. Provide a database alias or Notion ID');
  }

  return { databaseId, apiKey, dbConfig };
}

// Standardized error handling wrapper
function withErrorHandling<T extends any[]>(fn: (...args: T) => Promise<void>): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (error) {
      logger.error('Operation failed:', error);
      process.exit(1);
    }
  };
}

program
  .name('context-forge')
  .description('Download and merge Notion database content into organized files')
  .version('1.0.0');

program
  .command('add')
  .description('Add or update a database configuration')
  .argument('<alias>', 'Alias name for the database')
  .argument('<notion-id>', 'Notion database ID')
  .option('-n, --name <name>', 'Display name for the database')
  .option('-d, --description <description>', 'Description of the database')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(withErrorHandling(async (alias, notionId, options) => {
    const configManager = new ConfigManager(options.config);
    await configManager.addDatabase(alias, notionId, options.name, options.description);
    logger.success(`Database "${alias}" configured successfully`);
  }));

program
  .command('remove')
  .description('Remove a database configuration')
  .argument('<alias>', 'Alias name of the database to remove')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(withErrorHandling(async (alias, options) => {
    const configManager = new ConfigManager(options.config);
    await configManager.removeDatabase(alias);
    logger.success(`Database "${alias}" removed successfully`);
  }));

program
  .command('list')
  .description('List all configured databases')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(withErrorHandling(async (options) => {
    const configManager = new ConfigManager(options.config);
    const databases = await configManager.listDatabases();
    
    if (databases.length === 0) {
      logger.info('No databases configured');
      return;
    }
    
    console.log('\nConfigured databases:');
    console.log('─'.repeat(50));
    
    databases.forEach((db, index) => {
      const defaultMarker = index === 0 ? ' (default)' : '';
      console.log(`${db.alias}${defaultMarker}`);
      console.log(`  ID: ${db.notionId}`);
      if (db.name) console.log(`  Name: ${db.name}`);
      if (db.description) console.log(`  Description: ${db.description}`);
      console.log('');
    });
  }));

program
  .command('set-api-key')
  .alias('key')
  .description('Set the default Notion API key')
  .argument('<api-key>', 'Notion API key to set as default')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(withErrorHandling(async (apiKey, options) => {
    const configManager = new ConfigManager(options.config);
    await configManager.setDefaultApiKey(apiKey);
    logger.success('Default Notion API key set successfully');
  }));

program
  .command('export')
  .description('Export Notion database content')
  .argument('<database>', 'Database alias or Notion ID')
  .argument('[category]', 'Only export pages belonging to this category')
  .option('-k, --api-key <key>', 'Notion API key')
  .option('-f, --format <format>', 'Output format (markdown, pdf, both)', 'markdown')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-n, --name <name>', 'Base name for merged output file (without extension)')
  .option('--timestamped', 'Append YYYY-MM-DD to merged output filename', false)
  .option('--prefix-timestamp', 'Prefix all exported files with YYYY-MM-DD timestamp', false)
  .option('--prefix-database-name', 'Prefix all exported files with database name', false)
  .option('--export-flag <property>', 'Only export pages where this Notion checkbox property is true (default: Export)')
  .option('--force-all', 'Export all pages, ignoring the export checkbox property', false)
  .option('--folder-structure', 'Export markdown into folders mirroring categories and page subpages', false)
  .option('--merge-by-category', 'Merge pages by category', true)
  .option('--no-merge-by-category', 'Don\'t merge pages by category')
  .option('--merge-all', 'Merge all pages into a single markdown file', false)
  .option('--keep-latest-versions', 'Keep only the latest version for pages with versioned titles (e.g., v2, version 3.1)', true)
  .option('--no-keep-latest-versions', 'Do not filter older versions')
  .option('--include-metadata', 'Include page metadata', true)
  .option('--no-include-metadata', 'Don\'t include page metadata')
  .option('--include-toc', 'Include table of contents', true)
  .option('--no-include-toc', 'Don\'t include table of contents')
  .option('--order-by <property>', 'Order results by this Notion property (e.g. Order, Title)')
  .option('--order-direction <dir>', 'Order direction (ascending|descending)', 'ascending')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-q, --quiet', 'Minimal logging (errors only)')
  .option('--log-level <level>', 'Log level (silent, error, warn, info, debug)', 'info')
  .action(withErrorHandling(async (databaseArg, categoryArg, options) => {
    const configManager = new ConfigManager(options.config);
    
    // Configure logging level
    if (options.quiet) {
      logger.setLevel('silent');
    } else if (options.logLevel) {
      logger.setLevel(options.logLevel);
    }

    // Resolve database using shared logic
    const { databaseId, apiKey, dbConfig } = await resolveDatabase(configManager, databaseArg, options.apiKey);
    
    let exportOptions: ExportOptions = configManager.getDefaultExportOptions();

    // Override with CLI options
    exportOptions = {
      ...exportOptions,
      format: options.format || exportOptions.format,
      outputDir: options.output || exportOptions.outputDir,
      mergeByCategory: options.mergeByCategory,
      mergeAll: options.mergeAll,
      outputName: options.name || exportOptions.outputName,
      timestamped: options.timestamped || exportOptions.timestamped,
      prefixWithTimestamp: options.prefixTimestamp || exportOptions.prefixWithTimestamp,
      prefixWithDatabaseName: options.prefixDatabaseName || exportOptions.prefixWithDatabaseName,
      databaseName: dbConfig?.name || dbConfig?.alias,
      folderStructure: options.folderStructure,
      keepLatestVersions: options.keepLatestVersions,
      includeMetadata: options.includeMetadata,
      includeToc: options.includeToc,
      exportFlagPropertyName: options.forceAll ? undefined : (options.exportFlag || exportOptions.exportFlagPropertyName),
      orderByPropertyName: options.orderBy || exportOptions.orderByPropertyName,
      orderDirection: options.orderDirection || exportOptions.orderDirection,
    };
    
    logger.startSpinner('Connecting to Notion...');
    
    const notionService = new NotionService(apiKey, databaseId);
    const processor = new ContentProcessor();
    const merger = new MarkdownMerger();
    const pdfGenerator = new PdfGenerator();
    
    logger.updateSpinner('Fetching pages from Notion database...');
    let lastProgressShown = 0;
    const pages = await notionService.fetchAllPages({
      exportFlagPropertyName: options.forceAll ? undefined : exportOptions.exportFlagPropertyName,
      orderByPropertyName: exportOptions.orderByPropertyName,
      orderDirection: exportOptions.orderDirection,
      onProgress: (count) => {
        // Throttle spinner updates to avoid flicker
        if (count - lastProgressShown >= 10) {
          lastProgressShown = count;
          logger.updateSpinner(`Fetching pages from Notion database... (${count})`);
        }
      },
    });
    
    if (pages.length === 0) {
      logger.stopSpinner(false, 'No pages found in the database');
      process.exit(0);
    }
    
    logger.stopSpinner(true, `Fetched ${pages.length} pages`);

    // Fetch custom Notion category order (from select/multi-select option order)
    const categoryOrder = await notionService.fetchCategoryOrder();
    exportOptions = { ...exportOptions, categoryOrder: categoryOrder ?? undefined };
    const nonEmptyPages = processor.filterEmptyPages(pages);
    const filteredByVersion = exportOptions.keepLatestVersions
      ? processor.filterLatestVersions(nonEmptyPages)
      : nonEmptyPages;
    const pagesToExport = categoryArg
      ? filteredByVersion.filter(p => p.category === categoryArg)
      : filteredByVersion;

    if (categoryArg && pagesToExport.length === 0) {
      logger.warn(`No pages found for category: ${categoryArg}`);
      process.exit(0);
    }

    const groups = processor.groupByCategory(pagesToExport, categoryOrder);
    
    if (exportOptions.format === 'markdown' || exportOptions.format === 'both') {
      logger.info('Generating markdown files...');
      if (exportOptions.folderStructure) {
        const totalBar = logger.createProgressBar(groups.length, 'Markdown (folders):');
        await merger.exportAsFolderStructure(groups, exportOptions, () => totalBar.increment(1));
        totalBar.stop();
      } else if (exportOptions.mergeAll) {
        await merger.mergeAll(pagesToExport, exportOptions);
      } else if (exportOptions.mergeByCategory) {
        const totalBar = logger.createProgressBar(groups.length, 'Markdown:');
        await merger.mergeByCategory(groups, exportOptions, () => totalBar.increment(1));
        totalBar.stop();
      } else {
        await merger.mergeByCategory(groups, exportOptions);
      }
      logger.success('Markdown files generated');
    }
    
    if (exportOptions.format === 'pdf' || exportOptions.format === 'both') {
      logger.info('Generating PDF files...');
      if (exportOptions.mergeByCategory) {
        const totalBar = logger.createProgressBar(groups.length, 'PDF:');
        await pdfGenerator.generateCategoryPdfs(groups, exportOptions, () => totalBar.increment(1));
        totalBar.stop();
      } else {
        await pdfGenerator.generateAllPagesPdf(pagesToExport, exportOptions);
      }
      logger.success('PDF files generated');
    }
    
    logger.success(`Export complete! Files saved to ${path.resolve(exportOptions.outputDir)}`);
  }));

program
  .command('categories')
  .description('List all categories found in the Notion database')
  .argument('<database>', 'Database alias or Notion ID')
  .option('-k, --api-key <key>', 'Notion API key')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(withErrorHandling(async (databaseArg, options) => {
    const configManager = new ConfigManager(options.config);

    // Resolve database using shared logic
    const { databaseId, apiKey } = await resolveDatabase(configManager, databaseArg, options.apiKey);

    logger.startSpinner('Connecting to Notion...');
    const notionService = new NotionService(apiKey, databaseId);
    const processor = new ContentProcessor();

    logger.updateSpinner('Fetching pages from Notion database...');
    const pages = await notionService.fetchAllPages();
    logger.stopSpinner(true, `Fetched ${pages.length} pages`);

    const nonEmpty = processor.filterEmptyPages(pages);
    const categoryOrder = await notionService.fetchCategoryOrder();
    const groups = processor.groupByCategory(nonEmpty, categoryOrder);
    const categories = groups.map(g => g.category);

    if (categories.length === 0) {
      logger.info('No categories found');
      process.exit(0);
    }

    console.log(categories.join('\n'));
  }));

program.parse(process.argv);