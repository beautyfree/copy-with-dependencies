import * as vscode from 'vscode'

/**
 * Информация о зависимости
 */
export interface Dependency {
  /** Путь к файлу зависимости */
  filePath: string
  /** Содержимое файла */
  content: string
  /** Относительный путь от корня проекта */
  relativePath: string
  /** Тип зависимости (import, type, interface, etc.) */
  type:
    | 'import'
    | 'type'
    | 'interface'
    | 'class'
    | 'function'
    | 'constant'
    | 'enum'
  /** Имя зависимости */
  name?: string
}

/**
 * Фрагмент кода с метаданными
 */
export interface CodeFragment {
  /** Содержимое кода */
  content: string
  /** Путь к исходному файлу */
  filePath: string
  /** Относительный путь от корня проекта */
  relativePath?: string
  /** Диапазон строк в исходном файле */
  range?: vscode.Range
  /** Тип фрагмента */
  type: 'file' | 'class' | 'function' | 'selection' | 'method'
  /** Язык программирования */
  language: string
}

/**
 * Интерфейс плагина языка
 */
export interface LanguagePlugin {
  /** Идентификатор языка */
  languageId: string

  /** Поддерживаемые расширения файлов */
  fileExtensions: string[]

  /**
   * Парсит импорты из кода
   */
  parseImports(content: string, filePath: string): Promise<ImportInfo[]>

  /**
   * Находит определения зависимостей
   */
  resolveDependency(
    importInfo: ImportInfo,
    workspaceRoot: string
  ): Promise<Dependency | null>

  /**
   * Извлекает фрагмент кода (функция, класс и т.д.)
   */
  extractFragment(
    content: string,
    range: vscode.Range,
    type: CodeFragment['type']
  ): Promise<CodeFragment | null>

  /**
   * Извлекает локальные зависимости внутри файла для выбранного фрагмента
   */
  extractLocalDependencies?: (
    content: string,
    range: vscode.Range,
    filePath: string,
    workspaceRoot: string
  ) => Promise<Dependency[]>

  /**
   * Проверяет, является ли путь внешней зависимостью
   */
  isExternalDependency(importPath: string): boolean
}

/**
 * Информация об импорте
 */
export interface ImportInfo {
  /** Путь импорта */
  path: string
  /** Импортируемые имена */
  names: string[]
  /** Тип импорта */
  type: 'default' | 'named' | 'namespace' | 'type' | 'side-effect'
  /** Полная строка импорта */
  raw: string
  /** Позиция в коде */
  position?: { line: number; column: number }
  /** Файл, из которого идет импорт */
  fromFile?: string
}

/**
 * Опции разрешения зависимостей
 */
export interface ResolveOptions {
  /** Максимальная глубина рекурсии */
  maxDepth?: number
  /** Включать ли комментарии */
  includeComments?: boolean
  /** Включать ли внешние зависимости */
  includeExternal?: boolean
  /** Корень рабочего пространства */
  workspaceRoot: string
}

/**
 * Результат разрешения зависимостей
 */
export interface ResolveResult {
  /** Список зависимостей в правильном порядке */
  dependencies: Dependency[]
  /** Целевой фрагмент кода */
  targetFragment: CodeFragment
  /** Ошибки, возникшие при разрешении */
  errors: string[]
}
