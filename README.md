# Context Forge

A powerful CLI tool for downloading and merging Notion database content into organized files. Supports both database exports and single page exports with recursive sub-page fetching.

## Features

- **Multi-Database Support**: Configure and manage multiple Notion databases with aliases
- **Smart Export**: Automatically detects if an ID is a database or single page
- **Flexible Output**: Export to Markdown, PDF, or both formats
- **Category Organization**: Group content by Notion categories with custom ordering
- **Version Control**: Keep only the latest versions of pages with versioned titles
- **Metadata Support**: Include page metadata, creation dates, and URLs
- **Table of Contents**: Generate organized TOCs for better navigation
- **Folder Structure**: Option to export into folder hierarchies
- **API Key Management**: Set default API keys with priority resolution
- **Default Export Behavior**: By default, combines all categories into a single file with timestamp + database name prefix

## Quick Start

1. **Install the tool**:
   ```bash
   npm install -g context-forge
   ```

2. **Set your Notion API key**:
   ```bash
   context-forge set-api-key your-notion-api-key
   # or use the alias
   context-forge key your-notion-api-key
   ```

3. **Add a database**:
   ```bash
   context-forge add my-db your-database-id
   ```

4. **Export content**:
   ```bash
   context-forge export my-db
   ```

## Commands

### Database Management

- **`add <alias> <notion-id>`**: Add or update a database configuration
- **`remove <alias>`**: Remove a database configuration  
- **`list`**: List all configured databases
- **`set-api-key <api-key>`** (alias: **`key`**): Set the default Notion API key

### Export

- **`export <database> [category]`**: Export Notion database content
  - `<database>`: Database alias or direct Notion ID (required)
  - `[category]`: Optional category filter

### Information

- **`categories <database>`**: List all categories found in the database

## Default Export Behavior

By default, the tool exports a combined output of all categories into a single file, named with timestamp and database name (e.g., `2025-08-26_default_export.md`). This provides a comprehensive view of all content in one file.

## Page vs Database Export

The tool automatically detects whether the provided ID is a database or a single page:

- **Database ID**: Exports all pages from the database, respecting category organization
- **Page ID**: Exports the single page and recursively fetches all its sub-pages

This makes it easy to export either entire databases or specific page hierarchies.

## API Key Management

The tool resolves API keys in this priority order:

1. **Command line option** (`--api-key`) - Highest priority
2. **Configuration file** (`.context-forge.json`) - Medium priority  
3. **Environment variable** (`NOTION_API_KEY`) - Lowest priority

### Examples

```bash
# Use API key from config file
context-forge export my-db

# Override with command line API key
context-forge export my-db --api-key override-key

# Use environment variable (if no config file)
export NOTION_API_KEY=your-key
context-forge export my-db
```

## Configuration

The tool uses a `.context-forge.json` configuration file in your project directory:

```json
{
  "apiKey": "your-notion-api-key",
  "databases": [
    {
      "alias": "default",
      "notionId": "your-database-id",
      "name": "Default Database",
      "description": "Main database for content export"
    }
  ],
  "export": {
    "format": "markdown",
    "outputDir": "./output",
    "mergeByCategory": false,
    "keepLatestVersions": true,
    "includeMetadata": true,
    "includeToc": true,
    "folderStructure": false,
    "mergeAll": true,
    "timestamped": false,
    "prefixWithTimestamp": true,
    "prefixWithDatabaseName": true,
    "exportFlagPropertyName": "Export",
    "orderDirection": "ascending"
  }
}
```

**Note**: The first database in the `databases` array is automatically used as the default.

## Export Options

### File Naming

- **`--prefix-timestamp`**: Prefix files with YYYY-MM-DD timestamp
- **`--prefix-database-name`**: Prefix files with database name
- **`--timestamped`**: Append date to merged output filename

### Content Organization

- **`--merge-all`**: Merge all pages into a single file
- **`--merge-by-category`**: Group pages by category (default: false)
- **`--folder-structure`**: Export into folder hierarchy

### Content Filtering

- **`--export-flag <property>`**: Only export pages where checkbox property is true
- **`--force-all`**: Export all pages, ignoring export flags
- **`--keep-latest-versions`**: Filter out older versions of pages

### Output Control

- **`--format <format>`**: Output format (markdown, pdf, both)
- **`--include-metadata`**: Include page metadata
- **`--include-toc`**: Generate table of contents
- **`--order-by <property>`**: Sort by specific Notion property

## Examples

### Basic Export

```bash
# Export all content from default database
context-forge export default

# Export specific category
context-forge export default "Product Documentation"

# Export with custom output directory
context-forge export default -o ./docs
```

### Advanced Export

```bash
# Export to PDF with custom naming
context-forge export default --format pdf --prefix-timestamp --prefix-database-name

# Export with folder structure
context-forge export default --folder-structure

# Export ignoring export flags
context-forge export default --force-all
```

### Database Management

```bash
# Add a new database
context-forge add projects project-db-id --name "Project Database"

# List all databases
context-forge list

# Remove a database
context-forge remove old-db
```

## Installation

```bash
npm install -g context-forge
```

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/context-forge.git
cd context-forge

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
```

## License

MIT