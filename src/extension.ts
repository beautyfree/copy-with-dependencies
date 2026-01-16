import * as vscode from 'vscode'
import { DependencyResolver } from './resolver'
import { CodeFormatter } from './formatter'
import { CodeFragment, ResolveOptions } from './types'
import { getPluginForFile, getPluginForLanguage } from './languages'
import * as path from 'path'

/**
 * Activates the extension
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Copy with Dependencies extension is now active')

  let lastMouseSelections = new Map<string, vscode.Selection>()
  const selectionListener = vscode.window.onDidChangeTextEditorSelection(
    (event) => {
      if (
        event.kind === vscode.TextEditorSelectionChangeKind.Mouse &&
        event.textEditor?.document
      ) {
        lastMouseSelections.set(
          event.textEditor.document.uri.toString(),
          event.selections[0]
        )
      }
    }
  )

  // Register the command
  const disposable = vscode.commands.registerCommand(
    'copyWithDependencies.copy',
    async () => {
      await copyWithDependencies(lastMouseSelections)
    }
  )

  context.subscriptions.push(disposable, selectionListener)
}

/**
 * Deactivates the extension
 */
export function deactivate() {}

async function getSymbolRangeAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Range | null> {
  const symbols =
    (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri
    )) || []

  const flat: vscode.DocumentSymbol[] = []
  const collect = (items: vscode.DocumentSymbol[]) => {
    for (const item of items) {
      flat.push(item)
      if (item.children && item.children.length > 0) {
        collect(item.children)
      }
    }
  }
  collect(symbols)

  const allowedKinds = new Set<vscode.SymbolKind>([
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Method,
    vscode.SymbolKind.Class,
    vscode.SymbolKind.Interface,
    vscode.SymbolKind.Enum,
    vscode.SymbolKind.Variable,
    vscode.SymbolKind.Module,
  ])
  const containing = flat.filter(
    (sym) => sym.range.contains(position) && allowedKinds.has(sym.kind)
  )
  if (containing.length === 0) {
    return null
  }

  const rangeSize = (range: vscode.Range) => range.end.line - range.start.line
  containing.sort((a, b) => rangeSize(a.range) - rangeSize(b.range))

  return containing[0].range
}

/**
 * Main function to copy with dependencies
 */
async function copyWithDependencies(
  lastMouseSelections?: Map<string, vscode.Selection>
): Promise<void> {
  try {
    // Get the active editor
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showWarningMessage('No active editor')
      return
    }

    const document = editor.document
    const filePath = document.uri.fsPath
    const languageId = document.languageId

    // Get the workspace root
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace folder found')
      return
    }

    // Get a plugin for the language
    const plugin =
      getPluginForLanguage(languageId) || getPluginForFile(filePath)
    if (!plugin) {
      vscode.window.showWarningMessage(
        `Language ${languageId} is not supported yet`
      )
      return
    }

    // Determine selection type and extract fragment
    const selection = editor.selection
    const fileContent = document.getText()
    let fragment: CodeFragment

    const makeFullFileFragment = (): CodeFragment => {
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(document.lineCount - 1, Number.MAX_SAFE_INTEGER)
      )
      return {
        content: fileContent,
        filePath,
        range: fullRange,
        type: 'file',
        language: languageId,
      }
    }

    const makeRangeFragment = (
      range: vscode.Range,
      content: string
    ): CodeFragment => ({
      content,
      filePath,
      range,
      type: 'selection',
      language: languageId,
    })

    if (selection.isEmpty) {
      // No selection: use last mouse click position if available
      const mouseSelection =
        lastMouseSelections?.get(document.uri.toString()) || null
      const anchorSelection = mouseSelection || selection
      const anchorPosition = anchorSelection.active

      // 1) First, try to get the symbol range (function/class)
      const symbolRange = await getSymbolRangeAtPosition(
        document,
        anchorPosition
      )

      if (symbolRange) {
        fragment = makeRangeFragment(symbolRange, document.getText(symbolRange))
      } else {
        // 2) If no symbol is found, use the word under the cursor
        const wordRange =
          document.getWordRangeAtPosition(anchorPosition) || null
        if (wordRange) {
          fragment = makeRangeFragment(wordRange, document.getText(wordRange))
        } else {
          // 3) Fallback: entire file
          fragment = makeFullFileFragment()
        }
      }
    } else {
      // There is a selection: try to determine the type
      const selectedText = document.getText(selection)
      const range = selection

      // Try to extract the fragment via the plugin
      const extractedFragment = await plugin.extractFragment(
        document.getText(),
        range,
        'selection'
      )

      if (extractedFragment) {
        // Ensure the extracted fragment is not the whole file
        const fragmentContent = extractedFragment.content

        // If the fragment covers more than 80% of the file, use the selected text
        if (fragmentContent.length / fileContent.length > 0.8) {
          fragment = makeRangeFragment(range, selectedText)
        } else {
          fragment = {
            ...extractedFragment,
            filePath,
            range,
          }
        }
      } else {
        // Fallback: plain selected text
        fragment = makeRangeFragment(range, selectedText)
      }
    }

    // Add relativePath to the fragment
    if (!fragment.relativePath) {
      fragment.relativePath = path.relative(workspaceRoot, fragment.filePath)
    }

    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Copying with dependencies...',
        cancellable: false,
      },
      async () => {
        // Resolve dependencies
        const resolver = new DependencyResolver()
        const options: ResolveOptions = {
          workspaceRoot,
          maxDepth: 10,
          includeComments: true,
          includeExternal: false,
        }

        const result = await resolver.resolve(fragment, options)

        // Format result
        const formatter = new CodeFormatter()
        const formattedCode = formatter.format(result, {
          includeComments: true,
        })

        // Copy to clipboard
        await vscode.env.clipboard.writeText(formattedCode)

        // Show notification
        const depCount = result.dependencies.length
        const message =
          depCount > 0
            ? `Copied with ${depCount} dependenc${depCount === 1 ? 'y' : 'ies'}`
            : 'Copied (no dependencies found)'

        if (result.errors.length > 0) {
          vscode.window.showWarningMessage(
            `${message}. ${result.errors.length} warning(s).`
          )
        } else {
          vscode.window.showInformationMessage(message)
        }
      }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    vscode.window.showErrorMessage(`Error: ${errorMessage}`)
    console.error('Error in copyWithDependencies:', error)
  }
}
