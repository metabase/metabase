import * as path from 'node:path'
import * as vscode from 'vscode'

import type { WorkspaceManager } from './workspace-manager'
import { getWorkspaceTables } from './metabase-client'

export interface OutputTableInfo {
  tableId: number
  tableName: string
  schema: string | null
  workspaceApiKey: string
  databaseName: string
  dbId: number
}

export type WorkspaceDataNode =
  | { kind: 'workspace'; id: number; databaseName: string; tables: OutputTableInfo[] }
  | { kind: 'output-table'; table: OutputTableInfo }
  | { kind: 'output-column'; name: string; baseType: string }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }

export type OutputTableNode = Extract<WorkspaceDataNode, { kind: 'output-table' }>

export class WorkspaceDataTreeProvider implements vscode.TreeDataProvider<WorkspaceDataNode> {
  private nodes: WorkspaceDataNode[] = []
  private changeEmitter = new vscode.EventEmitter<WorkspaceDataNode | undefined | void>()
  readonly onDidChangeTreeData = this.changeEmitter.event
  private iconsPath: string
  private log: vscode.OutputChannel | undefined

  private host: string | undefined
  private apiKey: string | undefined
  private workspaceManager: WorkspaceManager | undefined

  constructor(extensionPath: string, log?: vscode.OutputChannel) {
    this.iconsPath = path.join(extensionPath, 'res', 'icons')
    this.log = log
  }

  setContext(host: string, apiKey: string, workspaceManager: WorkspaceManager): void {
    this.host = host
    this.apiKey = apiKey
    this.workspaceManager = workspaceManager
  }

  async refresh(): Promise<void> {
    this.nodes = [{kind: 'loading'}]
    this.changeEmitter.fire()

    if (!this.host || !this.apiKey || !this.workspaceManager) {
      this.log?.appendLine('workspaceData: no host/apiKey/manager, clearing')
      this.nodes = []
      this.changeEmitter.fire()
      return
    }

    try {
      const workspaces = await this.workspaceManager.list()
      this.log?.appendLine(`workspaceData: found ${workspaces.length} workspaces: ${workspaces.map(w => `${w.databaseName}(id=${w.id})`).join(', ')}`)

      if (workspaces.length === 0) {
        this.nodes = []
        this.changeEmitter.fire()
        return
      }

      const workspaceNodes: WorkspaceDataNode[] = []

      for (const ws of workspaces) {
        this.log?.appendLine(`workspaceData: fetching tables for workspace ${ws.id} (${ws.databaseName})`)
        const result = await getWorkspaceTables(this.host!, ws.api_key, ws.id)

        if (result.status !== 'success') {
          this.log?.appendLine(`workspaceData: failed for workspace ${ws.id}: ${result.message}`)
          continue
        }

        const outputs = result.result.outputs ?? []
        this.log?.appendLine(`workspaceData: workspace ${ws.id} raw outputs=${JSON.stringify(outputs)}`)

        const tables: OutputTableInfo[] = outputs
          .filter(o => o.isolated?.table_id != null)
          .map(o => ({
            tableId: o.isolated.table_id!,
            // Use global name/schema for display (original target), isolated id for queries
            tableName: o.global?.table ?? o.isolated.table,
            schema: o.global?.schema ?? o.isolated.schema,
            workspaceApiKey: ws.api_key,
            databaseName: ws.databaseName,
            dbId: o.db_id,
          }))

        this.log?.appendLine(`workspaceData: ${tables.length}/${outputs.length} tables have a table_id`)

        if (tables.length > 0) {
          workspaceNodes.push({
            kind: 'workspace',
            id: ws.id,
            databaseName: ws.databaseName,
            tables,
          })
        }
      }

      this.nodes = workspaceNodes.length > 0 ? workspaceNodes : []
      this.log?.appendLine(`workspaceData: refresh complete — ${workspaceNodes.length} workspace nodes`)
      this.changeEmitter.fire()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log?.appendLine(`workspaceData: refresh error: ${message}`)
      this.nodes = [{kind: 'error', message}]
      this.changeEmitter.fire()
    }
  }

  getTreeItem(element: WorkspaceDataNode): vscode.TreeItem {
    switch (element.kind) {
      case 'workspace': {
        const item = new vscode.TreeItem(element.databaseName, vscode.TreeItemCollapsibleState.Expanded)
        item.iconPath = this.iconPath('database')
        item.contextValue = 'workspaceDataDatabase'
        return item
      }
      case 'output-table': {
        const {table} = element
        const label = table.schema ? `${table.schema}.${table.tableName}` : table.tableName
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)
        item.iconPath = this.iconPath('table')
        item.contextValue = 'outputTable'
        item.command = {
          command: 'metastudio.viewTableData',
          title: 'View Data',
          arguments: [element],
        }
        return item
      }
      case 'output-column': {
        const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None)
        item.description = element.baseType
        item.iconPath = this.iconPath('hash')
        item.contextValue = 'outputColumn'
        return item
      }
      case 'loading': {
        const item = new vscode.TreeItem('Loading...', vscode.TreeItemCollapsibleState.None)
        item.iconPath = new vscode.ThemeIcon('loading~spin')
        return item
      }
      case 'error': {
        const item = new vscode.TreeItem('Error loading workspace data', vscode.TreeItemCollapsibleState.None)
        item.tooltip = element.message
        item.iconPath = new vscode.ThemeIcon('error')
        return item
      }
    }
  }

  getChildren(element?: WorkspaceDataNode): WorkspaceDataNode[] {
    if (!element) {
      return this.nodes
    }

    if (element.kind === 'workspace') {
      return element.tables.map(table => ({kind: 'output-table' as const, table}))
    }

    return []
  }

  private iconPath(name: string): { light: vscode.Uri; dark: vscode.Uri } {
    return {
      light: vscode.Uri.file(path.join(this.iconsPath, 'light', `${name}.svg`)),
      dark: vscode.Uri.file(path.join(this.iconsPath, 'dark', `${name}.svg`)),
    }
  }
}
