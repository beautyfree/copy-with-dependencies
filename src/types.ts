import * as vscode from 'vscode'

/**
 * Dependency information
 */
export interface Dependency {
  /** Path to the dependency file */
  filePath: string
  /** File contents */
  content: string
  /** Relative path from the project root */
  relativePath: string
  /** Dependency type (import, type, interface, etc.) */
  type:
    | 'import'
    | 'type'
    | 'interface'
    | 'class'
    | 'function'
    | 'constant'
    | 'enum'
  /** Dependency name */
  name?: string
}

/**
 * Code fragment with metadata
 */
export interface CodeFragment {
  /** Code contents */
  content: string
  /** Source file path */
  filePath: string
  /** Relative path from the project root */
  relativePath?: string
  /** Line range in the source file */
  range?: vscode.Range
  /** Fragment type */
  type: 'file' | 'class' | 'function' | 'selection' | 'method'
  /** Programming language */
  language: string
}

/**
 * Language plugin interface
 */
export interface LanguagePlugin {
  /** Language identifier */
  languageId: string

  /** Supported file extensions */
  fileExtensions: string[]

  /**
   * Parses imports from the code
   */
  parseImports(content: string, filePath: string): Promise<ImportInfo[]>

  /**
   * Resolves dependency definitions
   */
  resolveDependency(
    importInfo: ImportInfo,
    workspaceRoot: string
  ): Promise<Dependency | null>

  /**
   * Extracts a code fragment (function, class, etc.)
   */
  extractFragment(
    content: string,
    range: vscode.Range,
    type: CodeFragment['type']
  ): Promise<CodeFragment | null>

  /**
   * Extracts local dependencies within the file for the selected fragment
   */
  extractLocalDependencies?: (
    content: string,
    range: vscode.Range,
    filePath: string,
    workspaceRoot: string
  ) => Promise<Dependency[]>

  /**
   * Checks whether the path is an external dependency
   */
  isExternalDependency(importPath: string): boolean
}

/**
 * Import information
 */
export interface ImportInfo {
  /** Import path */
  path: string
  /** Imported names */
  names: string[]
  /** Import type */
  type: 'default' | 'named' | 'namespace' | 'type' | 'side-effect'
  /** Full import statement */
  raw: string
  /** Position in code */
  position?: { line: number; column: number }
  /** File where the import originates */
  fromFile?: string
}

/**
 * Dependency resolution options
 */
export interface ResolveOptions {
  /** Maximum recursion depth */
  maxDepth?: number
  /** Whether to include comments */
  includeComments?: boolean
  /** Whether to include external dependencies */
  includeExternal?: boolean
  /** Workspace root */
  workspaceRoot: string
}

/**
 * Dependency resolution result
 */
export interface ResolveResult {
  /** Dependency list in correct order */
  dependencies: Dependency[]
  /** Target code fragment */
  targetFragment: CodeFragment
  /** Errors encountered during resolution */
  errors: string[]
}
