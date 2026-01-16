import * as vscode from 'vscode'
import { BaseLanguagePlugin } from './base'
import { ImportInfo, Dependency, CodeFragment } from '../types'
import * as ts from 'typescript'

/**
 * Plugin for TypeScript and JavaScript
 */
export class TypeScriptPlugin extends BaseLanguagePlugin {
  languageId = 'typescript'
  fileExtensions = ['.ts', '.tsx', '.js', '.jsx']

  /**
   * Parses imports from code
   */
  async parseImports(content: string, filePath: string): Promise<ImportInfo[]> {
    const imports: ImportInfo[] = []

    try {
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
          ? ts.ScriptKind.TSX
          : ts.ScriptKind.TS
      )

      const visit = (node: ts.Node): void => {
        // Handle import statements
        if (ts.isImportDeclaration(node)) {
          const moduleSpecifier = node.moduleSpecifier
          if (ts.isStringLiteral(moduleSpecifier)) {
            const source = moduleSpecifier.text
            const specifiers = node.importClause

            if (!specifiers) {
              // Side-effect import
              imports.push({
                path: source,
                names: [],
                type: 'side-effect',
                raw: content.substring(node.getStart(), node.getEnd()),
                position: {
                  line: sourceFile.getLineAndCharacterOfPosition(
                    node.getStart()
                  ).line,
                  column: sourceFile.getLineAndCharacterOfPosition(
                    node.getStart()
                  ).character,
                },
                fromFile: filePath,
              })
            } else {
              // Default import
              if (specifiers.name) {
                imports.push({
                  path: source,
                  names: [specifiers.name.text],
                  type: 'default',
                  raw: content.substring(node.getStart(), node.getEnd()),
                  position: {
                    line: sourceFile.getLineAndCharacterOfPosition(
                      node.getStart()
                    ).line,
                    column: sourceFile.getLineAndCharacterOfPosition(
                      node.getStart()
                    ).character,
                  },
                  fromFile: filePath,
                })
              }

              // Named imports
              if (specifiers.namedBindings) {
                if (ts.isNamespaceImport(specifiers.namedBindings)) {
                  imports.push({
                    path: source,
                    names: [specifiers.namedBindings.name.text],
                    type: 'namespace',
                    raw: content.substring(node.getStart(), node.getEnd()),
                    position: {
                      line: sourceFile.getLineAndCharacterOfPosition(
                        node.getStart()
                      ).line,
                      column: sourceFile.getLineAndCharacterOfPosition(
                        node.getStart()
                      ).character,
                    },
                    fromFile: filePath,
                  })
                } else if (ts.isNamedImports(specifiers.namedBindings)) {
                  for (const element of specifiers.namedBindings.elements) {
                    const isTypeOnly = node.importClause?.isTypeOnly || false
                    imports.push({
                      path: source,
                      names: [element.name.text],
                      type: isTypeOnly ? 'type' : 'named',
                      raw: content.substring(node.getStart(), node.getEnd()),
                      position: {
                        line: sourceFile.getLineAndCharacterOfPosition(
                          node.getStart()
                        ).line,
                        column: sourceFile.getLineAndCharacterOfPosition(
                          node.getStart()
                        ).character,
                      },
                      fromFile: filePath,
                    })
                  }
                }
              }
            }
          }
        }

        // Handle require()
        if (ts.isVariableStatement(node)) {
          for (const declaration of node.declarationList.declarations) {
            if (
              declaration.initializer &&
              ts.isCallExpression(declaration.initializer)
            ) {
              const callExpr = declaration.initializer
              if (
                ts.isIdentifier(callExpr.expression) &&
                callExpr.expression.text === 'require' &&
                callExpr.arguments.length > 0
              ) {
                const arg = callExpr.arguments[0]
                if (ts.isStringLiteral(arg)) {
                  const name = ts.isIdentifier(declaration.name)
                    ? declaration.name.text
                    : 'unknown'
                  imports.push({
                    path: arg.text,
                    names: [name],
                    type: 'named',
                    raw: content.substring(node.getStart(), node.getEnd()),
                    position: {
                      line: sourceFile.getLineAndCharacterOfPosition(
                        node.getStart()
                      ).line,
                      column: sourceFile.getLineAndCharacterOfPosition(
                        node.getStart()
                      ).character,
                    },
                    fromFile: filePath,
                  })
                }
              }
            }
          }
        }

        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
    } catch (error) {
      // If parsing fails, return an empty array
      console.error('Error parsing imports:', error)
    }

    return imports
  }

  /**
   * Resolves a dependency
   */
  async resolveDependency(
    importInfo: ImportInfo,
    workspaceRoot: string
  ): Promise<Dependency | null> {
    const fromFile = importInfo.fromFile || ''
    const filePath = await this.resolveImportPath(
      importInfo.path,
      fromFile,
      workspaceRoot
    )

    if (!filePath) {
      return null
    }

    const content = await this.readFile(filePath)
    if (!content) {
      return null
    }

    return {
      filePath,
      content,
      relativePath: this.getRelativePath(filePath, workspaceRoot),
      type: importInfo.type === 'type' ? 'type' : 'import',
      name: importInfo.names[0],
    }
  }

  /**
   * Extracts a code fragment
   */
  async extractFragment(
    content: string,
    range: vscode.Range,
    type: CodeFragment['type']
  ): Promise<CodeFragment | null> {
    try {
      const sourceFile = ts.createSourceFile(
        '',
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      )

      // Compute offsets using document positions
      // TypeScript uses 0-based line indices
      let startPos: number
      let endPos: number

      try {
        startPos = sourceFile.getPositionOfLineAndCharacter(
          range.start.line,
          range.start.character
        )
        endPos = sourceFile.getPositionOfLineAndCharacter(
          range.end.line,
          range.end.character
        )
      } catch (error) {
        // Fallback: compute manually
        const lines = content.split('\n')
        startPos = 0
        for (let i = 0; i < range.start.line && i < lines.length; i++) {
          startPos += lines[i].length + 1 // +1 for \n
        }
        startPos += range.start.character

        endPos = 0
        for (let i = 0; i < range.end.line && i < lines.length; i++) {
          endPos += lines[i].length + 1
        }
        endPos += range.end.character
      }

      // Ensure positions are within the file
      startPos = Math.max(0, Math.min(startPos, content.length))
      endPos = Math.max(startPos, Math.min(endPos, content.length))

      let targetNode: ts.Node | null = null

      // Helper to check whether a node is a top-level declaration
      const isTopLevelDeclaration = (node: ts.Node): boolean => {
        return (
          ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isVariableStatement(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node) ||
          ts.isEnumDeclaration(node) ||
          ts.isModuleDeclaration(node)
        )
      }

      // Helper to check whether a node is a declaration (including methods)
      const isDeclaration = (node: ts.Node): boolean => {
        return (
          isTopLevelDeclaration(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isPropertyDeclaration(node) ||
          ts.isGetAccessorDeclaration(node) ||
          ts.isSetAccessorDeclaration(node) ||
          ts.isConstructorDeclaration(node)
        )
      }

      // Recursively collect declarations that contain the selection
      const candidates: ts.Node[] = []

      const collectContainingDeclarations = (node: ts.Node): void => {
        const nodeStart = node.getStart()
        const nodeEnd = node.getEnd()

        // If the node doesn't contain the selection, skip it and its children
        if (nodeStart > endPos || nodeEnd < startPos) {
          return
        }

        // If the node fully contains the selection
        if (nodeStart <= startPos && nodeEnd >= endPos) {
          // If it's a declaration, add it to candidates
          if (isDeclaration(node)) {
            candidates.push(node)
          }

          // Continue searching child nodes for more specific matches
          ts.forEachChild(node, collectContainingDeclarations)
        } else {
          // If the node partially overlaps, search in child nodes
          ts.forEachChild(node, collectContainingDeclarations)
        }
      }

      // Collect all candidates
      ts.forEachChild(sourceFile, collectContainingDeclarations)

      // Choose the smallest node (most specific)
      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          const sizeA = a.getEnd() - a.getStart()
          const sizeB = b.getEnd() - b.getStart()
          return sizeA - sizeB
        })

        // Take the first suitable node, excluding SourceFile
        const first = candidates.find((node) => node !== sourceFile) || null
        targetNode = first
      }

      if (targetNode) {
        const node: ts.Node = targetNode
        const nodeStart = node.getStart()
        const nodeEnd = node.getEnd()

        // Ensure this is not SourceFile itself
        if (
          node === sourceFile ||
          (node.getStart() === 0 && node.getEnd() >= content.length - 1)
        ) {
          // This is the whole file, use fallback
          const lines = content.split('\n')
          const startLine = range.start.line
          const endLine = range.end.line
          const fragmentContent = lines.slice(startLine, endLine + 1).join('\n')

          return {
            content: fragmentContent,
            filePath: '',
            range,
            type: 'selection',
            language: 'typescript',
          }
        }

        // Ensure this is actually a declaration (function, class, etc.)
        if (!isDeclaration(node)) {
          // If this is not a declaration, use fallback
          const lines = content.split('\n')
          const startLine = range.start.line
          const endLine = range.end.line
          const fragmentContent = lines.slice(startLine, endLine + 1).join('\n')

          return {
            content: fragmentContent,
            filePath: '',
            range,
            type: 'selection',
            language: 'typescript',
          }
        }

        // Ensure we are not returning the whole file
        // If the node takes more than 80% of the file, it is likely the whole file
        const fileSize = content.length
        const nodeSize = nodeEnd - nodeStart
        const nodeRatio = nodeSize / fileSize

        // If the node is too large (>80% of the file), use fallback
        if (nodeRatio > 0.8) {
          // Fallback: return selected text
          const lines = content.split('\n')
          const startLine = range.start.line
          const endLine = range.end.line
          const fragmentContent = lines.slice(startLine, endLine + 1).join('\n')

          return {
            content: fragmentContent,
            filePath: '',
            range,
            type: 'selection',
            language: 'typescript',
          }
        }

        const fragmentContent = content.substring(nodeStart, nodeEnd)
        return {
          content: fragmentContent,
          filePath: '',
          range,
          type: this.getNodeType(node, type),
          language: 'typescript',
        }
      }

      // Fallback: return selected text
      const lines = content.split('\n')
      const startLine = range.start.line
      const endLine = range.end.line
      const fragmentContent = lines.slice(startLine, endLine + 1).join('\n')

      return {
        content: fragmentContent,
        filePath: '',
        range,
        type: 'selection',
        language: 'typescript',
      }
    } catch (error) {
      // Fallback: return selected text
      const lines = content.split('\n')
      const startLine = range.start.line
      const endLine = range.end.line
      const fragmentContent = lines.slice(startLine, endLine + 1).join('\n')

      return {
        content: fragmentContent,
        filePath: '',
        range,
        type: 'selection',
        language: 'typescript',
      }
    }
  }

  /**
   * Extracts local dependencies within the file for the selected fragment
   */
  async extractLocalDependencies(
    content: string,
    range: vscode.Range,
    filePath: string,
    workspaceRoot: string
  ): Promise<Dependency[]> {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    )

    let startPos = 0
    let endPos = 0
    try {
      startPos = sourceFile.getPositionOfLineAndCharacter(
        range.start.line,
        range.start.character
      )
      endPos = sourceFile.getPositionOfLineAndCharacter(
        range.end.line,
        range.end.character
      )
    } catch {
      startPos = 0
      endPos = content.length
    }

    const declarationByName = new Map<string, ts.Node>()
    const declarationNamesByNode = new Map<ts.Node, string[]>()

    const addDeclaration = (name: string, node: ts.Node) => {
      if (!declarationByName.has(name)) {
        declarationByName.set(name, node)
      }
      const names = declarationNamesByNode.get(node) || []
      if (!names.includes(name)) {
        names.push(name)
      }
      declarationNamesByNode.set(node, names)
    }

    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        addDeclaration(statement.name.text, statement)
        continue
      }
      if (ts.isClassDeclaration(statement) && statement.name) {
        addDeclaration(statement.name.text, statement)
        continue
      }
      if (ts.isInterfaceDeclaration(statement)) {
        addDeclaration(statement.name.text, statement)
        continue
      }
      if (ts.isTypeAliasDeclaration(statement)) {
        addDeclaration(statement.name.text, statement)
        continue
      }
      if (ts.isEnumDeclaration(statement)) {
        addDeclaration(statement.name.text, statement)
        continue
      }
      if (ts.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            addDeclaration(decl.name.text, statement)
          }
        }
      }
    }

    const localDeclaredNames = new Set<string>()
    const collectLocalDeclarations = (node: ts.Node) => {
      const nodeStart = node.getStart()
      const nodeEnd = node.getEnd()
      if (nodeStart > endPos || nodeEnd < startPos) {
        return
      }

      const addName = (nameNode?: ts.Identifier) => {
        if (nameNode) {
          localDeclaredNames.add(nameNode.text)
        }
      }

      if (ts.isFunctionDeclaration(node) && node.name) {
        addName(node.name)
      } else if (ts.isClassDeclaration(node) && node.name) {
        addName(node.name)
      } else if (ts.isInterfaceDeclaration(node)) {
        addName(node.name)
      } else if (ts.isTypeAliasDeclaration(node)) {
        addName(node.name)
      } else if (ts.isEnumDeclaration(node)) {
        addName(node.name)
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        addName(node.name)
      } else if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
        addName(node.name)
      }

      ts.forEachChild(node, collectLocalDeclarations)
    }
    collectLocalDeclarations(sourceFile)

    const requiredNames = new Set<string>()
    const isDeclarationName = (identifier: ts.Identifier): boolean => {
      const parent = identifier.parent
      return (
        (ts.isFunctionDeclaration(parent) && parent.name === identifier) ||
        (ts.isClassDeclaration(parent) && parent.name === identifier) ||
        (ts.isInterfaceDeclaration(parent) && parent.name === identifier) ||
        (ts.isTypeAliasDeclaration(parent) && parent.name === identifier) ||
        (ts.isEnumDeclaration(parent) && parent.name === identifier) ||
        (ts.isVariableDeclaration(parent) && parent.name === identifier) ||
        (ts.isParameter(parent) && parent.name === identifier)
      )
    }

    const getLocalDeclaredNamesForNode = (node: ts.Node): Set<string> => {
      const names = new Set<string>()
      const addName = (nameNode?: ts.Identifier) => {
        if (nameNode) {
          names.add(nameNode.text)
        }
      }
      const visit = (n: ts.Node) => {
        if (ts.isFunctionDeclaration(n) && n.name) {
          addName(n.name)
        } else if (ts.isClassDeclaration(n) && n.name) {
          addName(n.name)
        } else if (ts.isInterfaceDeclaration(n)) {
          addName(n.name)
        } else if (ts.isTypeAliasDeclaration(n)) {
          addName(n.name)
        } else if (ts.isEnumDeclaration(n)) {
          addName(n.name)
        } else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
          addName(n.name)
        } else if (ts.isParameter(n) && ts.isIdentifier(n.name)) {
          addName(n.name)
        }
        ts.forEachChild(n, visit)
      }
      visit(node)
      return names
    }

    const collectIdentifiersInSpan = (
      node: ts.Node,
      spanStart: number,
      spanEnd: number,
      localNames: Set<string>,
      outNames: Set<string>
    ) => {
      const nodeStart = node.getStart()
      const nodeEnd = node.getEnd()
      if (nodeStart > spanEnd || nodeEnd < spanStart) {
        return
      }

      if (ts.isIdentifier(node)) {
        const parent = node.parent
        if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
          return
        }
        if (ts.isPropertyAssignment(parent) && parent.name === node) {
          return
        }
        if (isDeclarationName(node)) {
          return
        }

        const name = node.text
        if (declarationByName.has(name) && !localNames.has(name)) {
          outNames.add(name)
        }
      }

      ts.forEachChild(node, (child) =>
        collectIdentifiersInSpan(
          child,
          spanStart,
          spanEnd,
          localNames,
          outNames
        )
      )
    }

    // Initial dependencies from the fragment
    collectIdentifiersInSpan(
      sourceFile,
      startPos,
      endPos,
      localDeclaredNames,
      requiredNames
    )

    const findTargetDeclarationName = (): string | null => {
      for (const statement of sourceFile.statements) {
        const nodeStart = statement.getStart()
        const nodeEnd = statement.getEnd()
        if (nodeStart <= startPos && nodeEnd >= endPos) {
          if (ts.isFunctionDeclaration(statement) && statement.name) {
            return statement.name.text
          }
          if (ts.isClassDeclaration(statement) && statement.name) {
            return statement.name.text
          }
        }
      }
      return null
    }

    // If the selected entity is a function/class, add dependencies from its usages
    const targetDeclarationName = findTargetDeclarationName()
    if (targetDeclarationName) {
      const getEnclosingStatement = (node: ts.Node): ts.Statement | null => {
        let current: ts.Node | undefined = node
        while (current) {
          if (ts.isStatement(current)) {
            return current
          }
          current = current.parent
        }
        return null
      }

      const collectUsageDependencies = (node: ts.Node) => {
        if (ts.isIdentifier(node) && node.text === targetDeclarationName) {
          if (isDeclarationName(node)) {
            return
          }
          const statement = getEnclosingStatement(node)
          if (statement) {
            const stmtStart = statement.getStart()
            const stmtEnd = statement.getEnd()
            if (stmtEnd < startPos || stmtStart > endPos) {
              // Collect identifiers from the statement except the target itself
              const addIdentifiers = (n: ts.Node) => {
                if (ts.isIdentifier(n)) {
                  if (n.text === targetDeclarationName) {
                    return
                  }
                  if (isDeclarationName(n)) {
                    return
                  }
                  if (declarationByName.has(n.text)) {
                    requiredNames.add(n.text)
                  }
                }
                ts.forEachChild(n, addIdentifiers)
              }
              addIdentifiers(statement)
            }
          }
        }
        ts.forEachChild(node, collectUsageDependencies)
      }

      collectUsageDependencies(sourceFile)
    }

    const requiredNodes: ts.Node[] = []
    const seenNodes = new Set<ts.Node>()
    const queue: string[] = Array.from(requiredNames)

    while (queue.length > 0) {
      const name = queue.shift()
      if (!name) {
        continue
      }
      const node = declarationByName.get(name)
      if (!node || seenNodes.has(node)) {
        continue
      }

      seenNodes.add(node)
      requiredNodes.push(node)

      const nodeLocalNames = getLocalDeclaredNamesForNode(node)
      const nodeNames = new Set<string>()
      collectIdentifiersInSpan(
        node,
        node.getStart(),
        node.getEnd(),
        nodeLocalNames,
        nodeNames
      )
      for (const depName of nodeNames) {
        if (!requiredNames.has(depName)) {
          requiredNames.add(depName)
          queue.push(depName)
        }
      }
    }

    requiredNodes.sort((a, b) => a.getStart() - b.getStart())

    const relativeBase = this.getRelativePath(filePath, workspaceRoot)
    const dependencies: Dependency[] = []

    for (const node of requiredNodes) {
      const nodeStart = node.getStart()
      const nodeEnd = node.getEnd()
      const snippet = content.substring(nodeStart, nodeEnd)
      const names = declarationNamesByNode.get(node) || []
      const name = names[0]

      let type: Dependency['type'] = 'function'
      if (ts.isClassDeclaration(node)) {
        type = 'class'
      } else if (ts.isInterfaceDeclaration(node)) {
        type = 'interface'
      } else if (ts.isTypeAliasDeclaration(node)) {
        type = 'type'
      } else if (ts.isEnumDeclaration(node)) {
        type = 'enum'
      } else if (ts.isVariableStatement(node)) {
        type = 'constant'
      }

      const suffix = name ? `#local:${name}` : '#local'
      dependencies.push({
        filePath: `${filePath}${suffix}`,
        content: snippet,
        relativePath: `${relativeBase}${suffix}`,
        type,
        name,
      })
    }

    return dependencies
  }

  /**
   * Computes the text offset by line and column
   * @deprecated Use getPositionOfLineAndCharacter from sourceFile
   */
  private getOffset(content: string, line: number, character: number): number {
    const lines = content.split('\n')
    let offset = 0
    for (let i = 0; i < line && i < lines.length; i++) {
      offset += lines[i].length + 1 // +1 for the newline character
    }
    return offset + character
  }

  /**
   * Determines the AST node type
   */
  private getNodeType(
    node: ts.Node,
    requestedType: CodeFragment['type']
  ): CodeFragment['type'] {
    if (ts.isClassDeclaration(node)) {
      return 'class'
    }
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
      return 'function'
    }
    if (ts.isMethodDeclaration(node)) {
      return 'method'
    }
    return requestedType || 'selection'
  }
}
