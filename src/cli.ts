#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import { NotionService } from './services/notion';
import { ContentProcessor } from './services/processor';
import { MarkdownMerger } from './services/merger';
import { PdfGenerator } from './services/pdf';
import { ConfigManager } from './utils/config';
import { logger } from './utils/logger';
import { ExportOptions } from './types';

const program = new Command();

program
  .name('notion-bundler')
  .description('Download and merge Notion database content into organized files')
  .version('1.0.0');

program
  .command('export')
  .description('Export Notion database content')
  .argument('[category]', 'Only export pages belonging to this category')
  .option('-k, --api-key <key>', 'Notion API key')
  .option('-d, --database-id <id>', 'Notion database ID')
  .option('-f, --format <format>', 'Output format (markdown, pdf, both)', 'markdown')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('--merge-by-category', 'Merge pages by category', true)
  .option('--no-merge-by-category', 'Don\'t merge pages by category')
  .option('--include-metadata', 'Include page metadata', true)
  .option('--no-include-metadata', 'Don\'t include page metadata')
  .option('--include-toc', 'Include table of contents', true)
  .option('--no-include-toc', 'Don\'t include table of contents')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(async (categoryArg, options) => {
    try {
      const configManager = new ConfigManager(options.config);
      
      let notionConfig = configManager.getNotionConfig();
      let exportOptions: ExportOptions = configManager.getDefaultExportOptions();
      
      const fileConfig = await configManager.loadConfig();
      if (fileConfig) {
        notionConfig = notionConfig || fileConfig.notion;
        exportOptions = { ...exportOptions, ...fileConfig.export };
      }
      
      if (options.apiKey) notionConfig = { ...notionConfig!, apiKey: options.apiKey };
      if (options.databaseId) notionConfig = { ...notionConfig!, databaseId: options.databaseId };
      
      if (!notionConfig || !notionConfig.apiKey || !notionConfig.databaseId) {
        logger.error('Notion API key and database ID are required');
        logger.info('Set them via environment variables, config file, or command line options');
        process.exit(1);
      }
      
      exportOptions = {
        ...exportOptions,
        format: options.format,
        outputDir: options.output,
        mergeByCategory: options.mergeByCategory,
        includeMetadata: options.includeMetadata,
        includeToc: options.includeToc,
      };
      
      logger.startSpinner('Connecting to Notion...');
      
      const notionService = new NotionService(notionConfig.apiKey, notionConfig.databaseId);
      const processor = new ContentProcessor();
      const merger = new MarkdownMerger();
      const pdfGenerator = new PdfGenerator();
      
      logger.updateSpinner('Fetching pages from Notion database...');
      const pages = await notionService.fetchAllPages();
      
      if (pages.length === 0) {
        logger.stopSpinner(false, 'No pages found in the database');
        process.exit(0);
      }
      
      logger.stopSpinner(true, `Fetched ${pages.length} pages`);
      
      const nonEmptyPages = processor.filterEmptyPages(pages);
      const pagesToExport = categoryArg
        ? nonEmptyPages.filter(p => p.category === categoryArg)
        : nonEmptyPages;

      if (categoryArg && pagesToExport.length === 0) {
        logger.warn(`No pages found for category: ${categoryArg}`);
        process.exit(0);
      }

      const groups = processor.groupByCategory(pagesToExport);
      
      if (exportOptions.format === 'markdown' || exportOptions.format === 'both') {
        logger.info('Generating markdown files...');
        if (exportOptions.mergeByCategory) {
          const totalBar = logger.createProgressBar(groups.length, 'Total Markdown:');
          await merger.mergeByCategory(groups, exportOptions, () => totalBar.increment());
          totalBar.stop();
        } else {
          await merger.mergeAll(pagesToExport, exportOptions);
        }
        logger.success('Markdown files generated');
      }
      
      if (exportOptions.format === 'pdf' || exportOptions.format === 'both') {
        logger.info('Generating PDF files...');
        if (exportOptions.mergeByCategory) {
          const totalBar = logger.createProgressBar(groups.length, 'Total PDF:');
          await pdfGenerator.generateCategoryPdfs(groups, exportOptions, () => totalBar.increment());
          totalBar.stop();
        } else {
          await pdfGenerator.generateAllPagesPdf(pagesToExport, exportOptions);
        }
        logger.success('PDF files generated');
      }
      
      logger.success(`Export complete! Files saved to ${path.resolve(exportOptions.outputDir)}`);
    } catch (error) {
      logger.stopSpinner(false);
      logger.error('Export failed:', error);
      process.exit(1);
    }
  });

program
  .command('categories')
  .description('List all categories found in the Notion database')
  .option('-k, --api-key <key>', 'Notion API key')
  .option('-d, --database-id <id>', 'Notion database ID')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager(options.config);

      let notionConfig = configManager.getNotionConfig();
      const fileConfig = await configManager.loadConfig();
      if (fileConfig) {
        notionConfig = notionConfig || fileConfig.notion;
      }

      if (options.apiKey) notionConfig = { ...notionConfig!, apiKey: options.apiKey };
      if (options.databaseId) notionConfig = { ...notionConfig!, databaseId: options.databaseId };

      if (!notionConfig || !notionConfig.apiKey || !notionConfig.databaseId) {
        logger.error('Notion API key and database ID are required');
        logger.info('Set them via environment variables, config file, or command line options');
        process.exit(1);
      }

      logger.startSpinner('Connecting to Notion...');
      const notionService = new NotionService(notionConfig.apiKey, notionConfig.databaseId);
      const processor = new ContentProcessor();

      logger.updateSpinner('Fetching pages from Notion database...');
      const pages = await notionService.fetchAllPages();
      logger.stopSpinner(true, `Fetched ${pages.length} pages`);

      const nonEmpty = processor.filterEmptyPages(pages);
      const groups = processor.groupByCategory(nonEmpty);
      const categories = groups.map(g => g.category).sort((a, b) => a.localeCompare(b));

      if (categories.length === 0) {
        logger.info('No categories found');
        process.exit(0);
      }

      console.log(categories.join('\n'));
    } catch (error) {
      logger.stopSpinner(false);
      logger.error('Failed to list categories:', error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize configuration files')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      await configManager.createSampleConfig();
      await configManager.createEnvFile();
      logger.info('Configuration files created. Update them with your Notion credentials.');
    } catch (error) {
      logger.error('Failed to create configuration files:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);