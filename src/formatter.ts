import { Dependency, CodeFragment, ResolveResult } from './types'

/**
 * Форматирует результат разрешения зависимостей в читаемый код
 */
export class CodeFormatter {
  /**
   * Форматирует результат в строку для копирования
   */
  format(
    result: ResolveResult,
    options: { includeComments?: boolean } = {}
  ): string {
    const includeComments = options.includeComments !== false
    const lines: string[] = []

    // Добавляем заголовок
    if (includeComments) {
      lines.push('// ========================================')
      lines.push('// Dependencies')
      lines.push('// ========================================')
      lines.push('')
    }

    // Добавляем зависимости
    const addedFiles = new Set<string>()
    for (const dep of result.dependencies) {
      // Дедупликация по пути файла
      if (addedFiles.has(dep.filePath)) {
        continue
      }
      addedFiles.add(dep.filePath)

      // Комментарий с путем файла
      if (includeComments) {
        lines.push(`// From: ${dep.relativePath}`)
        lines.push('// ---')
      }

      // Содержимое файла
      const depContent = this.cleanContent(dep.content)
      lines.push(depContent)

      // Разделитель
      if (includeComments) {
        lines.push('')
        lines.push('// ---')
        lines.push('')
      } else {
        lines.push('')
      }
    }

    // Добавляем целевой фрагмент
    if (includeComments) {
      lines.push('// ========================================')
      lines.push('// Target Code')
      lines.push('// ========================================')
      lines.push('')
    }

    if (includeComments && result.targetFragment.filePath) {
      lines.push(
        `// From: ${
          result.targetFragment.relativePath || result.targetFragment.filePath
        }`
      )
      lines.push('// ---')
      lines.push('')
    }

    // Содержимое целевого фрагмента
    const targetContent = this.cleanContent(result.targetFragment.content)
    lines.push(targetContent)

    // Добавляем ошибки, если есть
    if (result.errors.length > 0 && includeComments) {
      lines.push('')
      lines.push('// ========================================')
      lines.push('// Warnings')
      lines.push('// ========================================')
      for (const error of result.errors) {
        lines.push(`// ${error}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Очищает содержимое от лишних пробелов и форматирует
   */
  private cleanContent(content: string): string {
    // Убираем лишние пустые строки в начале и конце
    let cleaned = content.trim()

    // Нормализуем окончания строк
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    return cleaned
  }

  /**
   * Форматирует зависимости в более компактном виде
   */
  formatCompact(result: ResolveResult): string {
    const lines: string[] = []
    const addedFiles = new Set<string>()

    // Зависимости
    for (const dep of result.dependencies) {
      if (addedFiles.has(dep.filePath)) {
        continue
      }
      addedFiles.add(dep.filePath)

      lines.push(`// ${dep.relativePath}`)
      lines.push(this.cleanContent(dep.content))
      lines.push('')
    }

    // Целевой код
    lines.push(
      `// ${
        result.targetFragment.relativePath || result.targetFragment.filePath
      }`
    )
    lines.push(this.cleanContent(result.targetFragment.content))

    return lines.join('\n')
  }
}
