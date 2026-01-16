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
 * Движок разрешения зависимостей
 */
export class DependencyResolver {
  private visitedFiles = new Set<string>()
  private dependencyGraph = new Map<string, Set<string>>()
  private resolvedDependencies = new Map<string, Dependency>()

  /**
   * Разрешает зависимости для фрагмента кода
   */
  async resolve(
    fragment: CodeFragment,
    options: ResolveOptions
  ): Promise<ResolveResult> {
    // Сброс состояния
    this.visitedFiles.clear()
    this.dependencyGraph.clear()
    this.resolvedDependencies.clear()

    const errors: string[] = []
    const maxDepth = options.maxDepth || 10

    // Получаем плагин для языка
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

    // Разрешаем зависимости рекурсивно
    await this.resolveDependenciesRecursive(
      fragment.filePath,
      plugin,
      options,
      maxDepth,
      0,
      errors
    )

    // Топологическая сортировка зависимостей
    const sortedDependencies = this.topologicalSort()

    // Локальные зависимости внутри файла (функции/константы и т.д.)
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
   * Рекурсивно разрешает зависимости
   */
  private async resolveDependenciesRecursive(
    filePath: string,
    plugin: any,
    options: ResolveOptions,
    maxDepth: number,
    currentDepth: number,
    errors: string[]
  ): Promise<void> {
    // Проверка глубины
    if (currentDepth >= maxDepth) {
      return
    }

    // Проверка на циклы
    if (this.visitedFiles.has(filePath)) {
      return
    }

    // Читаем файл
    let content: string
    try {
      content = fs.readFileSync(filePath, 'utf-8')
    } catch (error) {
      errors.push(`Cannot read file: ${filePath}`)
      return
    }

    this.visitedFiles.add(filePath)

    // Парсим импорты
    const imports = await plugin.parseImports(content, filePath)

    // Инициализируем граф зависимостей для этого файла
    if (!this.dependencyGraph.has(filePath)) {
      this.dependencyGraph.set(filePath, new Set())
    }

    // Разрешаем каждую зависимость
    for (const importInfo of imports) {
      // Пропускаем внешние зависимости, если не включены
      if (
        !options.includeExternal &&
        plugin.isExternalDependency(importInfo.path)
      ) {
        continue
      }

      // Устанавливаем fromFile, если не установлен
      if (!importInfo.fromFile) {
        importInfo.fromFile = filePath
      }

      // Разрешаем путь импорта
      const resolvedPath = await this.resolveImportPath(
        importInfo.path,
        filePath,
        options.workspaceRoot,
        plugin
      )

      if (!resolvedPath) {
        continue
      }

      // Добавляем в граф
      this.dependencyGraph.get(filePath)!.add(resolvedPath)

      // Если зависимость еще не разрешена, разрешаем её
      if (!this.resolvedDependencies.has(resolvedPath)) {
        const dependency = await plugin.resolveDependency(
          importInfo,
          options.workspaceRoot
        )
        if (dependency) {
          this.resolvedDependencies.set(resolvedPath, dependency)

          // Рекурсивно разрешаем зависимости этой зависимости
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
   * Разрешает путь импорта
   */
  private async resolveImportPath(
    importPath: string,
    fromFile: string,
    workspaceRoot: string,
    plugin: any
  ): Promise<string | null> {
    // Если это внешняя зависимость, возвращаем null
    if (plugin.isExternalDependency(importPath)) {
      return null
    }

    const fromDir = path.dirname(fromFile)
    let resolvedPath: string

    if (importPath.startsWith('/')) {
      // Абсолютный путь от корня проекта
      resolvedPath = path.join(workspaceRoot, importPath)
    } else {
      // Относительный путь
      resolvedPath = path.resolve(fromDir, importPath)
    }

    // Пробуем различные расширения
    const extensions = plugin.fileExtensions
    for (const ext of extensions) {
      const withExt = resolvedPath + ext
      if (fs.existsSync(withExt)) {
        return withExt
      }
    }

    // Пробуем без расширения (если уже есть)
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath
    }

    // Пробуем index файл
    for (const ext of extensions) {
      const indexPath = path.join(resolvedPath, `index${ext}`)
      if (fs.existsSync(indexPath)) {
        return indexPath
      }
    }

    return null
  }

  /**
   * Топологическая сортировка зависимостей
   */
  private topologicalSort(): Dependency[] {
    const sorted: Dependency[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    // Функция для обхода в глубину
    const visit = (filePath: string): void => {
      if (visiting.has(filePath)) {
        // Обнаружен цикл, пропускаем
        return
      }

      if (visited.has(filePath)) {
        return
      }

      visiting.add(filePath)

      // Посещаем зависимости
      const deps = this.dependencyGraph.get(filePath)
      if (deps) {
        for (const dep of deps) {
          visit(dep)
        }
      }

      visiting.delete(filePath)
      visited.add(filePath)

      // Добавляем зависимость в результат
      const dependency = this.resolvedDependencies.get(filePath)
      if (dependency) {
        sorted.push(dependency)
      }
    }

    // Обходим все файлы
    for (const filePath of this.dependencyGraph.keys()) {
      if (!visited.has(filePath)) {
        visit(filePath)
      }
    }

    // Добавляем зависимости, которые не были в графе (листовые узлы)
    for (const [filePath, dependency] of this.resolvedDependencies.entries()) {
      if (!visited.has(filePath)) {
        sorted.push(dependency)
      }
    }

    return sorted
  }
}
