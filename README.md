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
npm install -g notion-bundler
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
notion-bundler init
```

3. Update `.env` with your credentials:
```env
NOTION_API_KEY=your-notion-api-key
NOTION_DATABASE_ID=your-database-id
```

4. Export your content:
```bash
notion-bundler export
```

## Usage

### Export Command

```bash
notion-bundler export [options]
```

Options:
- `-k, --api-key <key>` - Notion API key
- `-d, --database-id <id>` - Notion database ID
- `-f, --format <format>` - Output format: markdown, pdf, or both (default: markdown)
- `-o, --output <dir>` - Output directory (default: ./output)
- `--merge-by-category` - Merge pages by category (default: true)
- `--no-merge-by-category` - Export all pages to a single file
- `--include-metadata` - Include page metadata (default: true)
- `--include-toc` - Include table of contents (default: true)
- `-c, --config <path>` - Path to configuration file

### Examples

Export with command-line options:
```bash
notion-bundler export -k your-api-key -d your-database-id -f both -o ./exports
```

Export to PDF without metadata:
```bash
notion-bundler export -f pdf --no-include-metadata
```

Export all pages to a single file:
```bash
notion-bundler export --no-merge-by-category
```

## Configuration

### Priority Order
1. Command-line options (highest priority)
2. Configuration file (`.notion-bundler.json`)
3. Environment variables
4. Default values

### Configuration File

Create a `.notion-bundler.json`:

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
    "includeToc": true
  }
}
```

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