import * as vscode from 'vscode'

export interface ConnectionItem {
  kind: 'url' | 'token'
  label: string
  value: string
}

export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionItem> {
  private changeEmitter = new vscode.EventEmitter<ConnectionItem | undefined | void>()
  readonly onDidChangeTreeData = this.changeEmitter.event

  constructor(
    private readonly getHost: () => string,
    private readonly hasApiKey: () => boolean,
  ) {}

  refresh(): void {
    this.changeEmitter.fire()
  }

  getTreeItem(element: ConnectionItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None)
    item.description = element.value
    item.contextValue = element.kind === 'url' ? 'connectionUrl' : 'connectionToken'
    item.iconPath = new vscode.ThemeIcon(element.kind === 'url' ? 'globe' : 'key')
    return item
  }

  getChildren(element?: ConnectionItem): ConnectionItem[] {
    if (element) {
      return []
    }

    const host = this.getHost()
    const apiKeyConfigured = this.hasApiKey()

    return [
      {
        kind: 'url',
        label: 'Instance URL',
        value: host || 'Not configured',
      },
      {
        kind: 'token',
        label: 'API Key',
        value: apiKeyConfigured ? 'Configured' : 'Not configured',
      },
    ]
  }
}
