# Copy with Dependencies Extension

VS Code extension that allows you to copy code fragments along with all their local dependencies.

## Features

- Copy code with dependencies from context menu
- Supports TypeScript and JavaScript
- Automatically resolves import paths
- Topological sorting of dependencies
- Preserves code structure and comments
- Works with files, classes, functions, and selected blocks

## Usage

1. Right-click on code in the editor
2. Select "Copy with Dependencies" from the context menu
3. The code and all its dependencies will be copied to clipboard

## Supported Languages

- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)

## How It Works

The extension:
1. Parses the selected code to find imports
2. Resolves import paths to local files
3. Recursively collects all dependencies
4. Sorts dependencies in correct order (topological sort)
5. Formats the result with comments showing file paths
6. Copies everything to clipboard

## Development

```bash
npm install
npm run compile
```

## License

AGPL-3.0-only
