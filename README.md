# Context Forge

A command-line tool to download and merge content from your Notion database into organized markdown or PDF files by category.

## Features

- 📥 Download all pages from a Notion database
- 📁 Automatically organize content by category
- 📝 Export to Markdown or PDF format
- 🔀 Merge pages by category or into a single file
- 📑 Generate table of contents
- 🔗 Include metadata and Notion links
- ⚙️ Configurable via environment variables, config files, or CLI options

## Installation

```bash
npm install -g context-forge
```

Or run locally:

```bash
npm install
npm run build
```

## Quick Start

1. Get your Notion API key and database ID:
   - Create an integration at https://www.notion.so/my-integrations
   - Share your database with the integration
   - Copy the database ID from the database URL

2. Initialize configuration files:
```bash
context-forge init
```

3. Update `.env` with your credentials:
```env
NOTION_API_KEY=your-notion-api-key
NOTION_DATABASE_ID=your-database-id
```

4. Export your content:
```bash
context-forge export
```

## Usage

### Export Command

```bash
context-forge export [options]
```

Options:
- `-k, --api-key <key>` - Notion API key
- `-d, --database-id <id>` - Notion database ID
- `-f, --format <format>` - Output format: markdown, pdf, or both (default: markdown)
- `-o, --output <dir>` - Output directory (default: ./output)
- `--merge-by-category` - Merge pages by category (default: true)
- `--no-merge-by-category` - Export all pages to a single file
- `--folder-structure` - Export markdown into folders mirroring categories and page subpages (default: false)
- `--include-metadata` - Include page metadata (default: true)
- `--include-toc` - Include table of contents (default: true)
- `--export-flag <property>` - Only export pages where this Notion checkbox property is true (default: Export)
- `--order-by <property>` - Order results by this Notion database property (e.g. `Order`, `Title`)
- `--order-direction <dir>` - Order direction: `ascending` or `descending` (default: `ascending`)
- `-c, --config <path>` - Path to configuration file

### Examples

Export with command-line options:
```bash
context-forge export -k your-api-key -d your-database-id -f both -o ./exports
```

Export to PDF without metadata:
```bash
context-forge export -f pdf --no-include-metadata
```

Export all pages to a single file:
```bash
context-forge export --no-merge-by-category
```

Export as folder structure (categories as folders, pages as subfolders, subpages as files):
```bash
context-forge export --folder-structure
```

## Configuration

### Priority Order
1. Command-line options (highest priority)
2. Configuration file (`.context-forge.json`)
3. Environment variables
4. Default values

### Configuration File

Create a `.context-forge.json`:

```json
{
  "notion": {
    "apiKey": "your-notion-api-key",
    "databaseId": "your-database-id"
  },
  "export": {
    "format": "markdown",
    "outputDir": "./output",
    "mergeByCategory": true,
    "includeMetadata": true,
    "includeToc": true,
    "folderStructure": false,
    "exportFlagPropertyName": "Export",
    "orderByPropertyName": "Order",
    "orderDirection": "ascending"
  }
}
```
### Folder Structure Mode

When `--folder-structure` is enabled, output will be organized as:

```
output/
  <Category>/
    <Page A>.md                # if Page A has no subpages
    <Page B>/                  # if Page B has subpages
      index.md                 # Page B main content and metadata
      <Subpage 1>.md
      <Subpage 2>.md
```

Notes:
- Subpages are detected from Notion child pages; they become separate `.md` files within the page folder.
- Metadata inclusion is controlled by `--include-metadata`.


## Database Setup

Your Notion database should have:
- A title property (Title, Name, etc.)
- A category property (Category, Tags, Type, etc.) for organization
- Content in the page body

The tool automatically detects common property names.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -- export

# Build the project
npm run build

# Run built version
npm start -- export
```

## License

ISC