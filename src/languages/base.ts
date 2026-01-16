import * as vscode from 'vscode'
import {
  LanguagePlugin,
  ImportInfo,
  Dependency,
  CodeFragment,
  ResolveOptions,
} from '../types'
import * as path from 'path'
import * as fs from 'fs'

/**
 * Base class for language plugins
 */
export abstract class BaseLanguagePlugin implements LanguagePlugin {
  abstract languageId: string
  abstract fileExtensions: string[]

  /**
   * Checks whether the path is an external dependency
   */
  isExternalDependency(importPath: string): boolean {
    // Check standard external dependency patterns
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      // This can be an npm package or an absolute path
      return true
    }

    // Check for node_modules
    if (importPath.includes('node_modules')) {
      return true
    }

    return false
  }

  /**
   * Resolves an import path to a real file
   */
  protected async resolveImportPath(
    importPath: string,
    fromFile: string,
    workspaceRoot: string
  ): Promise<string | null> {
    // If this is an external dependency, return null
    if (this.isExternalDependency(importPath)) {
      return null
    }

    const fromDir = path.dirname(fromFile)
    let resolvedPath: string

    if (importPath.startsWith('/')) {
      // Absolute path from the project root
      resolvedPath = path.join(workspaceRoot, importPath)
    } else {
      // Relative path
      resolvedPath = path.resolve(fromDir, importPath)
    }

    // Try different extensions
    const extensions = this.fileExtensions
    for (const ext of extensions) {
      const withExt = resolvedPath + ext
      if (fs.existsSync(withExt)) {
        return withExt
      }
    }

    // Try without extension (if already present)
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath
    }

    // Try index file
    for (const ext of extensions) {
      const indexPath = path.join(resolvedPath, `index${ext}`)
      if (fs.existsSync(indexPath)) {
        return indexPath
      }
    }

    return null
  }

  /**
   * Reads file contents
   */
  protected async readFile(filePath: string): Promise<string | null> {
    try {
      return fs.readFileSync(filePath, 'utf-8')
    } catch (error) {
      return null
    }
  }

  /**
   * Gets the relative path from the project root
   */
  protected getRelativePath(filePath: string, workspaceRoot: string): string {
    return path.relative(workspaceRoot, filePath)
  }

  abstract parseImports(
    content: string,
    filePath: string
  ): Promise<ImportInfo[]>
  abstract resolveDependency(
    importInfo: ImportInfo,
    workspaceRoot: string
  ): Promise<Dependency | null>
  abstract extractFragment(
    content: string,
    range: vscode.Range,
    type: CodeFragment['type']
  ): Promise<CodeFragment | null>
}
