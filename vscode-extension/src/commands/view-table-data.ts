import {useCommand} from 'reactive-vscode'
import {Uri, ViewColumn, window} from 'vscode'

import type {ExtensionCtx} from '../extension-context'
import type {OutputTableNode} from '../workspace-data-tree-provider'
import {config} from '../config'
import {getTableData, getTableSchema} from '../metabase-client'
import {getTableDataWebviewHtml} from '../webview-html'

export function registerViewTableDataCommand(ctx: ExtensionCtx) {
  // Mutable ref so message handlers always use the latest node
  let currentNode: OutputTableNode | null = null

  useCommand('metastudio.viewTableData', async (node: OutputTableNode) => {
    const host = config.host
    if (!host) {
      window.showErrorMessage('Metabase host must be configured first.')
      return
    }

    currentNode = node
    const {table} = node
    const title = table.schema ? `${table.schema}.${table.tableName}` : table.tableName

    const extensionUri = Uri.file(ctx.extensionPath)

    if (!ctx.panels.tableDataPanel) {
      const panel = window.createWebviewPanel(
        'metabaseTableData',
        title,
        {viewColumn: ViewColumn.One, preserveFocus: false},
        {
          enableScripts: true,
          localResourceRoots: [Uri.joinPath(extensionUri, 'dist', 'webview')],
        },
      )
      panel.webview.html = getTableDataWebviewHtml(panel.webview, extensionUri)
      ctx.panels.tableDataPanel = panel

      panel.webview.onDidReceiveMessage(async (msg) => {
        if ((msg.type === 'ready' || msg.type === 'refresh') && currentNode) {
          await loadTableSchema(ctx, currentNode)
        }
        if (msg.type === 'loadData' && currentNode) {
          await loadTableData(ctx, currentNode)
        }
      })

      panel.onDidDispose(() => {
        ctx.panels.tableDataPanel = null
        currentNode = null
      })
    } else {
      ctx.panels.tableDataPanel.title = title
      ctx.panels.tableDataPanel.reveal(ViewColumn.One, false)
    }

    await loadTableSchema(ctx, node)
  })
}

async function loadTableSchema(ctx: ExtensionCtx, node: OutputTableNode) {
  const host = config.host
  const apiKey = ctx.apiKey.value
  if (!host || !apiKey || !ctx.panels.tableDataPanel) return

  const {table} = node

  ctx.panels.tableDataPanel.webview.postMessage({
    type: 'tableDataLoading',
    tableName: table.schema ? `${table.schema}.${table.tableName}` : table.tableName,
  })

  ctx.outputChannel.appendLine(`viewTableData: fetching schema id=${table.tableId} (${table.schema}.${table.tableName})`)

  const result = await getTableSchema(host, table.workspaceApiKey, table.dbId, table.tableId)

  if (result.status !== 'success') {
    ctx.outputChannel.appendLine(`viewTableData: schema error - ${result.message}`)
    ctx.panels.tableDataPanel.webview.postMessage({
      type: 'tableDataError',
      message: result.message,
    })
    return
  }

  ctx.outputChannel.appendLine(`viewTableData: got ${result.result.fields.length} fields`)

  ctx.panels.tableDataPanel.webview.postMessage({
    type: 'tableSchemaInit',
    data: {
      tableName: table.tableName,
      schema: table.schema,
      columns: result.result.fields.map(f => ({name: f.name, baseType: f.base_type})),
    },
  })
}

async function loadTableData(ctx: ExtensionCtx, node: OutputTableNode) {
  const host = config.host
  const apiKey = ctx.apiKey.value
  if (!host || !apiKey || !ctx.panels.tableDataPanel) return

  const {table} = node

  ctx.panels.tableDataPanel.webview.postMessage({
    type: 'tableDataLoading',
    tableName: table.schema ? `${table.schema}.${table.tableName}` : table.tableName,
  })

  ctx.outputChannel.appendLine(`viewTableData: fetching data id=${table.tableId} (${table.schema}.${table.tableName})`)

  // Use the user API key — workspace service key lacks permission for table data endpoints
  const result = await getTableData(host, apiKey, table.tableId)

  if (result.status !== 'success') {
    ctx.outputChannel.appendLine(`viewTableData: data error - ${result.message}`)
    ctx.panels.tableDataPanel.webview.postMessage({
      type: 'tableDataError',
      message: result.message,
    })
    return
  }

  ctx.outputChannel.appendLine(`viewTableData: got ${result.result.rows.length} rows, ${result.result.cols.length} cols`)

  ctx.panels.tableDataPanel.webview.postMessage({
    type: 'tableDataInit',
    data: {
      tableName: table.tableName,
      schema: table.schema,
      columns: result.result.cols.map(c => ({name: c.name, baseType: c.base_type})),
      rows: result.result.rows,
    },
  })
}
