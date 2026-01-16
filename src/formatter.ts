import { Dependency, CodeFragment, ResolveResult } from './types'

/**
 * Formats the dependency resolution result into readable code
 */
export class CodeFormatter {
  /**
   * Formats the result into a string for copying
   */
  format(
    result: ResolveResult,
    options: { includeComments?: boolean } = {}
  ): string {
    const includeComments = options.includeComments !== false
    const lines: string[] = []

    // Add header
    if (includeComments) {
      lines.push('// ========================================')
      lines.push('// Dependencies')
      lines.push('// ========================================')
      lines.push('')
    }

    // Add dependencies
    const addedFiles = new Set<string>()
    for (const dep of result.dependencies) {
      // Deduplicate by file path
      if (addedFiles.has(dep.filePath)) {
        continue
      }
      addedFiles.add(dep.filePath)

      // Comment with file path
      if (includeComments) {
        lines.push(`// From: ${dep.relativePath}`)
        lines.push('// ---')
      }

      // File contents
      const depContent = this.cleanContent(dep.content)
      lines.push(depContent)

      // Separator
      if (includeComments) {
        lines.push('')
        lines.push('// ---')
        lines.push('')
      } else {
        lines.push('')
      }
    }

    // Add target fragment
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

    // Target fragment contents
    const targetContent = this.cleanContent(result.targetFragment.content)
    lines.push(targetContent)

    // Add errors if any
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
   * Cleans content of extra whitespace and normalizes formatting
   */
  private cleanContent(content: string): string {
    // Remove extra blank lines at the beginning and end
    let cleaned = content.trim()

    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    return cleaned
  }

  /**
   * Formats dependencies in a more compact form
   */
  formatCompact(result: ResolveResult): string {
    const lines: string[] = []
    const addedFiles = new Set<string>()

    // Dependencies
    for (const dep of result.dependencies) {
      if (addedFiles.has(dep.filePath)) {
        continue
      }
      addedFiles.add(dep.filePath)

      lines.push(`// ${dep.relativePath}`)
      lines.push(this.cleanContent(dep.content))
      lines.push('')
    }

    // Target code
    lines.push(
      `// ${
        result.targetFragment.relativePath || result.targetFragment.filePath
      }`
    )
    lines.push(this.cleanContent(result.targetFragment.content))

    return lines.join('\n')
  }
}
