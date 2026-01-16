import { LanguagePlugin } from '../types'
import { TypeScriptPlugin } from './typescript'

/**
 * Регистрация плагинов языков
 */
const plugins: LanguagePlugin[] = [new TypeScriptPlugin()]

// Регистрируем TypeScript плагин также для JavaScript
class JavaScriptPlugin extends TypeScriptPlugin {
  languageId = 'javascript'
}

plugins.push(new JavaScriptPlugin())

/**
 * Получает плагин для языка по его идентификатору
 */
export function getPluginForLanguage(
  languageId: string
): LanguagePlugin | null {
  return plugins.find((p) => p.languageId === languageId) || null
}

/**
 * Получает плагин для файла по его расширению
 */
export function getPluginForFile(filePath: string): LanguagePlugin | null {
  const ext = filePath.substring(filePath.lastIndexOf('.'))
  return plugins.find((p) => p.fileExtensions.includes(ext)) || null
}

/**
 * Получает все зарегистрированные плагины
 */
export function getAllPlugins(): LanguagePlugin[] {
  return [...plugins]
}
