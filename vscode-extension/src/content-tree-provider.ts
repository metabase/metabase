import type { ContentGraph, ContentNode, TransformNode } from './metabase-lib'
import * as path from 'node:path'
import * as vscode from 'vscode'

export class ContentTreeProvider implements vscode.TreeDataProvider<ContentNode> {
  private graph: ContentGraph | null = null
  private changeEmitter = new vscode.EventEmitter<ContentNode | undefined | void>()
  readonly onDidChangeTreeData = this.changeEmitter.event
  private iconsPath: string

  constructor(extensionPath: string) {
    this.iconsPath = path.join(extensionPath, 'res', 'icons')
  }

  setGraph(graph: ContentGraph | null): void {
    this.graph = graph
    this.changeEmitter.fire()
  }

  get transforms(): TransformNode[] {
    return this.graph?.transforms ?? []
  }

  getTreeItem(element: ContentNode): vscode.TreeItem {
    const label = this.getLabel(element)
    const collapsible = this.hasChildren(element)
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None
    const item = new vscode.TreeItem(label, collapsible)
    item.iconPath = this.getIcon(element)
    item.tooltip = element.description ?? undefined

    if (element.kind === 'card') {
      item.contextValue = element.cardType === 'model' ? 'model' : element.cardType === 'metric' ? 'metric' : 'card'
    } else {
      item.contextValue = element.kind
    }

    if (element.kind === 'transform') {
      if (element.sourceQueryType === 'query') {
        item.contextValue = 'transformStructured'
        item.tooltip = 'Transforms based on the query builder cannot be run in a workspace'
      } else {
        item.contextValue = 'transform'
      }
      item.command = {
        command: 'metastudio.showTransformPreview',
        title: 'Preview Transform',
        arguments: [element],
      }
    } else if ('filePath' in element && element.filePath) {
      item.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [vscode.Uri.file(element.filePath)],
      }
    }

    return item
  }

  getChildren(element?: ContentNode): ContentNode[] {
    if (!this.graph) {
      return []
    }
    if (!element) {
      return this.graph.getRoots()
    }
    return this.graph.getChildren(element)
  }

  private getLabel(node: ContentNode): string {
    return node.name
  }

  private hasChildren(node: ContentNode): boolean {
    if (node.kind !== 'collection') {
      return false
    }
    return (
      node.children.length > 0
      || node.cards.length > 0
      || node.dashboards.length > 0
      || node.snippets.length > 0
      || node.timelines.length > 0
      || node.documents.length > 0
    )
  }

  private iconPath(name: string): { light: vscode.Uri, dark: vscode.Uri } {
    return {
      light: vscode.Uri.file(path.join(this.iconsPath, 'light', `${name}.svg`)),
      dark: vscode.Uri.file(path.join(this.iconsPath, 'dark', `${name}.svg`)),
    }
  }

  private getIcon(node: ContentNode): { light: vscode.Uri, dark: vscode.Uri } {
    switch (node.kind) {
      case 'collection': return this.iconPath('folder')
      case 'card':
        if (node.cardType === 'model')
          return this.iconPath('model')
        if (node.cardType === 'metric')
          return this.iconPath('metric')
        return this.iconPath('table2')
      case 'dashboard': return this.iconPath('dashboard')
      case 'native_query_snippet': return this.iconPath('snippet')
      case 'timeline': return this.iconPath('calendar')
      case 'document': return this.iconPath('document')
      case 'transform': return this.iconPath('transform')
      case 'action': return this.iconPath('bolt')
    }
  }
}
