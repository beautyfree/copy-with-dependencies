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

## Installation

### From VS Code Marketplace

1. Open VS Code or Cursor
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Copy with Dependencies"
4. Click Install

### From GitHub Release

**Using GUI:**

1. Go to [Releases](https://github.com/beautyfree/copy-with-dependencies/releases)
2. Download the latest `.vsix` file
3. Open VS Code or Cursor
4. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
5. Run: `Extensions: Install from VSIX...`
6. Select the downloaded `.vsix` file

**Using Terminal:**

1. Download the latest `.vsix` file from [Releases](https://github.com/beautyfree/copy-with-dependencies/releases)

2. For VS Code:
   ```bash
   code --install-extension copy-deps-extension-*.vsix
   ```

3. For Cursor:
   ```bash
   cursor --install-extension copy-deps-extension-*.vsix
   ```

   Or download and install in one command:
   ```bash
   # VS Code
   curl -L https://github.com/beautyfree/copy-with-dependencies/releases/latest/download/copy-deps-extension-*.vsix -o /tmp/extension.vsix && code --install-extension /tmp/extension.vsix
   
   # Cursor
   curl -L https://github.com/beautyfree/copy-with-dependencies/releases/latest/download/copy-deps-extension-*.vsix -o /tmp/extension.vsix && cursor --install-extension /tmp/extension.vsix
   ```

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
pnpm i
pnpm build
```

## Release (Marketplace)

Prerequisites:
- Create a VS Code publisher and a Personal Access Token (PAT).
- Add `VSCE_PAT` secret in your GitHub repository.

Release options:
- Tag-based release: push a tag like `v0.0.2` to trigger the workflow.
- Manual release: run the `Release VS Code Extension` workflow in GitHub Actions.

Local release:
```bash
pnpm run publish:patch
```

## License

AGPL-3.0-only
