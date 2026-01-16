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
 * Базовый класс для плагинов языков
 */
export abstract class BaseLanguagePlugin implements LanguagePlugin {
  abstract languageId: string
  abstract fileExtensions: string[]

  /**
   * Проверяет, является ли путь внешней зависимостью
   */
  isExternalDependency(importPath: string): boolean {
    // Проверяем стандартные паттерны внешних зависимостей
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      // Это может быть npm пакет или абсолютный путь
      return true
    }

    // Проверяем на node_modules
    if (importPath.includes('node_modules')) {
      return true
    }

    return false
  }

  /**
   * Разрешает путь импорта к реальному файлу
   */
  protected async resolveImportPath(
    importPath: string,
    fromFile: string,
    workspaceRoot: string
  ): Promise<string | null> {
    // Если это внешняя зависимость, возвращаем null
    if (this.isExternalDependency(importPath)) {
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
    const extensions = this.fileExtensions
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
   * Читает содержимое файла
   */
  protected async readFile(filePath: string): Promise<string | null> {
    try {
      return fs.readFileSync(filePath, 'utf-8')
    } catch (error) {
      return null
    }
  }

  /**
   * Получает относительный путь от корня проекта
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
