import * as vscode from 'vscode'
import {
  Dependency,
  CodeFragment,
  ResolveOptions,
  ResolveResult,
  ImportInfo,
} from './types'
import { getPluginForFile, getPluginForLanguage } from './languages'
import * as path from 'path'
import * as fs from 'fs'

/**
 * Dependency resolution engine
 */
export class DependencyResolver {
  private visitedFiles = new Set<string>()
  private dependencyGraph = new Map<string, Set<string>>()
  private resolvedDependencies = new Map<string, Dependency>()

  /**
   * Resolves dependencies for a code fragment
   */
  async resolve(
    fragment: CodeFragment,
    options: ResolveOptions
  ): Promise<ResolveResult> {
    // Reset state
    this.visitedFiles.clear()
    this.dependencyGraph.clear()
    this.resolvedDependencies.clear()

    const errors: string[] = []
    const maxDepth = options.maxDepth || 10

    // Get plugin for the language
    const plugin =
      getPluginForLanguage(fragment.language) ||
      getPluginForFile(fragment.filePath)
    if (!plugin) {
      return {
        dependencies: [],
        targetFragment: fragment,
        errors: [`No plugin found for language: ${fragment.language}`],
      }
    }

    // Resolve dependencies recursively
    await this.resolveDependenciesRecursive(
      fragment.filePath,
      plugin,
      options,
      maxDepth,
      0,
      errors
    )

    // Topologically sort dependencies
    const sortedDependencies = this.topologicalSort()

    // Local dependencies within the file (functions/constants, etc.)
    let localDependencies: Dependency[] = []
    if (
      fragment.range &&
      fragment.filePath &&
      typeof plugin.extractLocalDependencies === 'function'
    ) {
      try {
        const fileContent = fs.readFileSync(fragment.filePath, 'utf-8')
        localDependencies = await plugin.extractLocalDependencies(
          fileContent,
          fragment.range,
          fragment.filePath,
          options.workspaceRoot
        )
      } catch (error) {
        errors.push(`Cannot read file for local deps: ${fragment.filePath}`)
      }
    }

    return {
      dependencies: [...sortedDependencies, ...localDependencies],
      targetFragment: fragment,
      errors,
    }
  }

  /**
   * Recursively resolves dependencies
   */
  private async resolveDependenciesRecursive(
    filePath: string,
    plugin: any,
    options: ResolveOptions,
    maxDepth: number,
    currentDepth: number,
    errors: string[]
  ): Promise<void> {
    // Depth check
    if (currentDepth >= maxDepth) {
      return
    }

    // Cycle check
    if (this.visitedFiles.has(filePath)) {
      return
    }

    // Read file
    let content: string
    try {
      content = fs.readFileSync(filePath, 'utf-8')
    } catch (error) {
      errors.push(`Cannot read file: ${filePath}`)
      return
    }

    this.visitedFiles.add(filePath)

    // Parse imports
    const imports = await plugin.parseImports(content, filePath)

    // Initialize dependency graph for this file
    if (!this.dependencyGraph.has(filePath)) {
      this.dependencyGraph.set(filePath, new Set())
    }

    // Resolve each dependency
    for (const importInfo of imports) {
      // Skip external dependencies when not included
      if (
        !options.includeExternal &&
        plugin.isExternalDependency(importInfo.path)
      ) {
        continue
      }

      // Set fromFile when not provided
      if (!importInfo.fromFile) {
        importInfo.fromFile = filePath
      }

      // Resolve import path
      const resolvedPath = await this.resolveImportPath(
        importInfo.path,
        filePath,
        options.workspaceRoot,
        plugin
      )

      if (!resolvedPath) {
        continue
      }

      // Add to graph
      this.dependencyGraph.get(filePath)!.add(resolvedPath)

      // Resolve dependency if it has not been resolved yet
      if (!this.resolvedDependencies.has(resolvedPath)) {
        const dependency = await plugin.resolveDependency(
          importInfo,
          options.workspaceRoot
        )
        if (dependency) {
          this.resolvedDependencies.set(resolvedPath, dependency)

          // Recursively resolve this dependency's dependencies
          await this.resolveDependenciesRecursive(
            resolvedPath,
            plugin,
            options,
            maxDepth,
            currentDepth + 1,
            errors
          )
        }
      }
    }
  }

  /**
   * Resolves an import path
   */
  private async resolveImportPath(
    importPath: string,
    fromFile: string,
    workspaceRoot: string,
    plugin: any
  ): Promise<string | null> {
    // If this is an external dependency, return null
    if (plugin.isExternalDependency(importPath)) {
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
    const extensions = plugin.fileExtensions
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
   * Topological sort of dependencies
   */
  private topologicalSort(): Dependency[] {
    const sorted: Dependency[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    // Helper for depth-first traversal
    const visit = (filePath: string): void => {
      if (visiting.has(filePath)) {
        // Cycle detected, skip
        return
      }

      if (visited.has(filePath)) {
        return
      }

      visiting.add(filePath)

      // Visit dependencies
      const deps = this.dependencyGraph.get(filePath)
      if (deps) {
        for (const dep of deps) {
          visit(dep)
        }
      }

      visiting.delete(filePath)
      visited.add(filePath)

      // Add dependency to results
      const dependency = this.resolvedDependencies.get(filePath)
      if (dependency) {
        sorted.push(dependency)
      }
    }

    // Traverse all files
    for (const filePath of this.dependencyGraph.keys()) {
      if (!visited.has(filePath)) {
        visit(filePath)
      }
    }

    // Add dependencies not present in the graph (leaf nodes)
    for (const [filePath, dependency] of this.resolvedDependencies.entries()) {
      if (!visited.has(filePath)) {
        sorted.push(dependency)
      }
    }

    return sorted
  }
}
