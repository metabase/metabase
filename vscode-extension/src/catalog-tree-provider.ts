import * as path from 'node:path'
import * as vscode from 'vscode'
import type { CatalogGraph } from './metabase-lib'
import type { CatalogNode } from './metabase-lib'

export class CatalogTreeProvider implements vscode.TreeDataProvider<CatalogNode> {
  private graph: CatalogGraph | null = null
  private changeEmitter = new vscode.EventEmitter<CatalogNode | undefined | void>()
  readonly onDidChangeTreeData = this.changeEmitter.event
  private iconsPath: string

  constructor(extensionPath: string) {
    this.iconsPath = path.join(extensionPath, 'res', 'icons')
  }

  setGraph(graph: CatalogGraph | null): void {
    this.graph = graph
    this.changeEmitter.fire()
  }

  getTreeItem(element: CatalogNode): vscode.TreeItem {
    const label = this.getLabel(element)
    const collapsible = this.hasChildren(element)
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None
    const item = new vscode.TreeItem(label, collapsible)
    item.iconPath = this.getIcon(element)
    item.tooltip = ('description' in element ? element.description : undefined) ?? undefined

    item.contextValue = element.kind

    if ('filePath' in element && element.filePath) {
      item.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [vscode.Uri.file(element.filePath)],
      }
    }

    return item
  }

  getChildren(element?: CatalogNode): CatalogNode[] {
    if (!this.graph) {
      return []
    }
    if (!element) {
      return this.graph.getRoots()
    }
    return this.graph.getChildren(element)
  }

  private getLabel(node: CatalogNode): string {
    switch (node.kind) {
      case 'database': return node.name
      case 'schema': return node.name || '(default)'
      case 'table': return node.displayName
      case 'field': return node.displayName
      case 'measure': return node.name
      case 'segment': return node.name
    }
  }

  private hasChildren(node: CatalogNode): boolean {
    switch (node.kind) {
      case 'database': return node.schemas.length > 0
      case 'schema': return node.tables.length > 0
      case 'table': return node.fields.length > 0 || node.measures.length > 0 || node.segments.length > 0
      default: return false
    }
  }

  private iconPath(name: string): { light: vscode.Uri, dark: vscode.Uri } {
    return {
      light: vscode.Uri.file(path.join(this.iconsPath, 'light', `${name}.svg`)),
      dark: vscode.Uri.file(path.join(this.iconsPath, 'dark', `${name}.svg`)),
    }
  }

  private getIcon(node: CatalogNode): { light: vscode.Uri, dark: vscode.Uri } {
    switch (node.kind) {
      case 'database': return this.iconPath('database')
      case 'schema': return this.iconPath('folder_database')
      case 'table': return this.iconPath('table')
      case 'field':
        if (node.semanticType === 'type/PK') return this.iconPath('label')
        if (node.semanticType === 'type/FK') return this.iconPath('connections')
        return this.iconPath('int')
      case 'measure': return this.iconPath('metric')
      case 'segment': return this.iconPath('segment')
    }
  }
}
