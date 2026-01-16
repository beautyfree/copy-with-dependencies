import { LanguagePlugin } from '../types'
import { TypeScriptPlugin } from './typescript'

/**
 * Language plugin registration
 */
const plugins: LanguagePlugin[] = [new TypeScriptPlugin()]

// Register the TypeScript plugin for JavaScript as well
class JavaScriptPlugin extends TypeScriptPlugin {
  languageId = 'javascript'
}

plugins.push(new JavaScriptPlugin())

/**
 * Gets a plugin by its language identifier
 */
export function getPluginForLanguage(
  languageId: string
): LanguagePlugin | null {
  return plugins.find((p) => p.languageId === languageId) || null
}

/**
 * Gets a plugin for a file by its extension
 */
export function getPluginForFile(filePath: string): LanguagePlugin | null {
  const ext = filePath.substring(filePath.lastIndexOf('.'))
  return plugins.find((p) => p.fileExtensions.includes(ext)) || null
}

/**
 * Gets all registered plugins
 */
export function getAllPlugins(): LanguagePlugin[] {
  return [...plugins]
}
