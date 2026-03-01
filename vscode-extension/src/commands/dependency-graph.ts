import type { WebviewPanel } from 'vscode'

import type { ExtensionCtx } from '../extension-context'
import type { CatalogNode, ContentNode, DependencyGraphResult, ParsedEntities } from '../metabase-lib'
import type { WebviewToExtensionMessage } from '../shared-types'

import { useCommand, useFileSystemWatcher } from 'reactive-vscode'
import {
  commands,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Uri,
  ViewColumn,
  window,
} from 'vscode'
import { loadExport } from '../export-loader'
import { buildGraphViewData } from '../graph-view-data'
import { buildDependencyGraph, CatalogGraph, ContentGraph, parseDirectory } from '../metabase-lib'
import { getWebviewHtml } from '../webview-html'
import { getGraphNodeKey } from './open-in-metabase'

/** Walk raw MBQL data and collect all field vectors as [database, schema|null, table, field]. */
function collectFieldRefsFromRaw(node: unknown, refs: { database: string, schema: string | null, table: string, field: string }[]): void {
  if (node == null)
    return

  if (Array.isArray(node)) {
    // Check if this is a field vector: ["field", [db, schema, table, field, ...], opts?]
    if (
      node[0] === 'field'
      && Array.isArray(node[1])
      && node[1].length >= 4
      && typeof node[1][0] === 'string'
      && (node[1][1] === null || typeof node[1][1] === 'string')
      && typeof node[1][2] === 'string'
      && typeof node[1][3] === 'string'
    ) {
      refs.push({
        database: node[1][0],
        schema: node[1][1],
        table: node[1][2],
        field: node[1][3],
      })
      // Also recurse into opts (index 2) if present
      if (node.length >= 3 && node[2] != null && typeof node[2] === 'object') {
        collectFieldRefsFromRaw(node[2], refs)
      }
      return
    }

    // Recurse into array elements
    for (const element of node) {
      collectFieldRefsFromRaw(element, refs)
    }
    return
  }

  if (typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectFieldRefsFromRaw(value, refs)
    }
  }
}

/**
 * Validate field references in entities against cached workspace table metadata.
 * Returns diagnostics grouped by source file path, plus a total count.
 */
function validateFieldRefsAgainstCache(
  ctx: ExtensionCtx,
  entities: ParsedEntities,
): { byFile: Map<string, Diagnostic[]>, count: number } {
  const byFile = new Map<string, Diagnostic[]>()
  let count = 0

  const outputTables = ctx.workspaceDataProvider.getOutputTables()
  if (outputTables.length === 0 || ctx.tableMetadataCache.size === 0)
    return { byFile, count }

  // Build a lookup: "databaseName|schema|tableName" → tableId
  const tableKey = (db: string, schema: string | null, table: string) =>
    `${db}|${schema ?? ''}|${table}`

  const tableIdByKey = new Map<string, number>()
  for (const t of outputTables) {
    tableIdByKey.set(tableKey(t.databaseName, t.schema, t.tableName), t.tableId)
  }

  // Check transforms and cards — anything with raw MBQL that may contain field refs
  const entitiesToCheck: { raw: Record<string, unknown>, filePath: string, name: string }[] = [
    ...entities.transforms,
    ...entities.cards,
    ...entities.measures,
    ...entities.segments,
  ]

  for (const entity of entitiesToCheck) {
    const refs: { database: string, schema: string | null, table: string, field: string }[] = []
    collectFieldRefsFromRaw(entity.raw, refs)

    // Deduplicate by field identity
    const seen = new Set<string>()
    for (const ref of refs) {
      const key = `${ref.database}|${ref.schema ?? ''}|${ref.table}|${ref.field}`
      if (seen.has(key))
        continue
      seen.add(key)

      const tableId = tableIdByKey.get(tableKey(ref.database, ref.schema, ref.table))
      if (tableId == null)
        continue // table not in workspace data, skip

      const fieldNames = ctx.tableMetadataCache.getFieldNames(tableId)
      if (!fieldNames)
        continue // table not cached yet, skip

      if (!fieldNames.has(ref.field)) {
        const tableName = ref.schema ? `${ref.schema}.${ref.table}` : ref.table
        const diagnostic = new Diagnostic(
          new Range(0, 0, 0, 0),
          `Field "${ref.field}" does not exist in workspace table "${tableName}"`,
          DiagnosticSeverity.Warning,
        )
        diagnostic.source = 'metabase-dependencies'
        const existing = byFile.get(entity.filePath) ?? []
        existing.push(diagnostic)
        byFile.set(entity.filePath, existing)
        count++
      }
    }
  }

  return { byFile, count }
}

function publishDiagnostics(
  diagnosticCollection: ExtensionCtx['diagnosticCollection'],
  result: DependencyGraphResult,
) {
  diagnosticCollection.clear()
  const diagnosticsByFile = new Map<string, Diagnostic[]>()

  for (const issue of result.issues) {
    if (!issue.filePath)
      continue
    const severity
      = issue.severity === 'error'
        ? DiagnosticSeverity.Error
        : DiagnosticSeverity.Warning
    const diagnostic = new Diagnostic(
      new Range(0, 0, 0, 0),
      issue.message,
      severity,
    )
    diagnostic.source = 'metabase-dependencies'

    const existing = diagnosticsByFile.get(issue.filePath) ?? []
    existing.push(diagnostic)
    diagnosticsByFile.set(issue.filePath, existing)
  }

  for (const cycle of result.cycles) {
    const names = cycle.path.map(entity => entity.name)
    const message = `Dependency cycle: ${names.join(' → ')} → ${names[0]}`
    for (const entity of cycle.path) {
      if (!entity.filePath)
        continue
      const diagnostic = new Diagnostic(
        new Range(0, 0, 0, 0),
        message,
        DiagnosticSeverity.Warning,
      )
      diagnostic.source = 'metabase-dependencies'
      const existing = diagnosticsByFile.get(entity.filePath) ?? []
      existing.push(diagnostic)
      diagnosticsByFile.set(entity.filePath, existing)
    }
  }

  for (const [filePath, diagnostics] of diagnosticsByFile) {
    diagnosticCollection.set(Uri.file(filePath), diagnostics)
  }
}

async function sendGraphDataToWebview(ctx: ExtensionCtx, panel: WebviewPanel) {
  const folders = ctx.workspaceFolders.value
  if (!folders?.length || !ctx.configExists.value) {
    panel.webview.postMessage({
      type: 'init',
      configExists: false,
      nodes: [],
      edges: [],
      issueCount: 0,
      cycleCount: 0,
    })
    return
  }

  try {
    const rootPath = folders[0].uri.fsPath
    const entities = await parseDirectory(rootPath)
    const catalog = CatalogGraph.build(entities)
    const content = ContentGraph.build(entities)
    const graphResult = buildDependencyGraph(entities, catalog, content)
    const { nodes, edges } = buildGraphViewData(graphResult, entities)

    publishDiagnostics(ctx.diagnosticCollection, graphResult)

    panel.webview.postMessage({
      type: 'init',
      configExists: true,
      nodes,
      edges,
      issueCount: graphResult.issues.length,
      cycleCount: graphResult.cycles.length,
    })

    if (ctx.panels.pendingFocusNodeKey) {
      panel.webview.postMessage({
        type: 'focusNode',
        nodeKey: ctx.panels.pendingFocusNodeKey,
      })
      ctx.panels.pendingFocusNodeKey = null
    }
  }
  catch (error) {
    window.showErrorMessage(
      `Failed to build dependency graph: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function showDependencyGraph(ctx: ExtensionCtx, focusNodeKey?: string) {
  if (focusNodeKey) {
    ctx.panels.pendingFocusNodeKey = focusNodeKey
  }

  if (ctx.panels.graphPanel) {
    ctx.panels.graphPanel.reveal(ViewColumn.One)
    if (ctx.panels.pendingFocusNodeKey) {
      ctx.panels.graphPanel.webview.postMessage({
        type: 'focusNode',
        nodeKey: ctx.panels.pendingFocusNodeKey,
      })
      ctx.panels.pendingFocusNodeKey = null
    }
    return
  }

  const extensionUri = Uri.file(ctx.extensionPath)
  const panel = window.createWebviewPanel(
    'metabaseDependencyGraph',
    'Dependency Graph',
    ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [Uri.joinPath(extensionUri, 'dist', 'webview')],
    },
  )

  panel.webview.html = getWebviewHtml(panel.webview, extensionUri)
  ctx.panels.graphPanel = panel

  panel.webview.onDidReceiveMessage(
    async (message: WebviewToExtensionMessage) => {
      switch (message.type) {
        case 'ready':
          await sendGraphDataToWebview(ctx, panel)
          break
        case 'openFile':
          if (message.filePath) {
            const fileUri = Uri.file(message.filePath)
            await window.showTextDocument(fileUri)
          }
          break
      }
    },
  )

  panel.onDidDispose(() => {
    ctx.panels.graphPanel = null
  })
}

export function registerDependencyGraphCommands(ctx: ExtensionCtx) {
  useCommand('metastudio.checkDependencyGraph', async () => {
    const folders = ctx.workspaceFolders.value
    if (!folders?.length) {
      window.showWarningMessage('No workspace folder open.')
      return
    }

    const rootPath = folders[0].uri.fsPath
    const configUri = Uri.joinPath(folders[0].uri, 'metabase.config.json')
    try {
      const { workspace } = await import('vscode')
      await workspace.fs.stat(configUri)
    }
    catch {
      window.showWarningMessage(
        `No metabase.config.json found in workspace root.`,
      )
      return
    }

    await window.withProgress(
      {
        location: { viewId: 'metabase.content' },
        title: 'Checking dependency graph...',
      },
      async () => {
        try {
          const entities = await parseDirectory(rootPath)
          const catalog = CatalogGraph.build(entities)
          const content = ContentGraph.build(entities)
          const result = buildDependencyGraph(entities, catalog, content)

          publishDiagnostics(ctx.diagnosticCollection, result)

          // Validate field references against cached workspace metadata
          const fieldRefResult = validateFieldRefsAgainstCache(ctx, entities)
          for (const [filePath, diags] of fieldRefResult.byFile) {
            const uri = Uri.file(filePath)
            const existing = ctx.diagnosticCollection.get(uri) ?? []
            ctx.diagnosticCollection.set(uri, [...existing, ...diags])
          }

          const errorCount = result.issues.filter(
            issue => issue.severity === 'error',
          ).length
          const warningCount = result.issues.filter(
            issue => issue.severity === 'warning',
          ).length + fieldRefResult.count
          const cycleCount = result.cycles.length

          if (errorCount === 0 && warningCount === 0 && cycleCount === 0) {
            window.showInformationMessage(
              `Dependency check passed. ${result.entities.size} entities, ${result.edges.length} dependencies, no issues.`,
            )
          }
          else {
            commands.executeCommand('workbench.actions.view.problems')

            const parts: string[] = []
            if (errorCount > 0)
              parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`)
            if (warningCount > 0) {
              parts.push(
                `${warningCount} warning${warningCount > 1 ? 's' : ''}`,
              )
            }
            if (cycleCount > 0)
              parts.push(`${cycleCount} cycle${cycleCount > 1 ? 's' : ''}`)
            const action = await window.showWarningMessage(
              `Dependency check: ${parts.join(', ')}.`,
              'Show Problems',
            )
            if (action === 'Show Problems') {
              commands.executeCommand('workbench.actions.view.problems')
            }
          }
        }
        catch (error) {
          window.showErrorMessage(
            `Dependency check failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      },
    )
  })

  useCommand('metastudio.showDependencyGraph', () => showDependencyGraph(ctx))

  useCommand(
    'metastudio.showInDependencyGraph',
    (node: ContentNode | CatalogNode) => {
      const nodeKey = getGraphNodeKey(node)
      if (nodeKey) {
        showDependencyGraph(ctx, nodeKey)
      }
    },
  )

  // Debounced dependency checking on YAML file changes
  let checkDebounceTimer: ReturnType<typeof setTimeout> | null = null

  async function runDebouncedCheck() {
    if (!ctx.configExists.value)
      return
    const folders = ctx.workspaceFolders.value
    if (!folders?.length)
      return

    try {
      const rootPath = folders[0].uri.fsPath
      const entities = await parseDirectory(rootPath)
      const catalog = CatalogGraph.build(entities)
      const content = ContentGraph.build(entities)
      const result = buildDependencyGraph(entities, catalog, content)
      publishDiagnostics(ctx.diagnosticCollection, result)
    }
    catch {
      // silently fail for background checks
    }
  }

  function scheduleCheck() {
    if (checkDebounceTimer)
      clearTimeout(checkDebounceTimer)
    checkDebounceTimer = setTimeout(runDebouncedCheck, 1000)
  }

  function onYamlChanged() {
    loadExport(ctx)
    if (ctx.panels.graphPanel)
      sendGraphDataToWebview(ctx, ctx.panels.graphPanel)
    scheduleCheck()
  }

  useFileSystemWatcher('**/*.yaml', {
    onDidCreate: onYamlChanged,
    onDidChange: onYamlChanged,
    onDidDelete: onYamlChanged,
  })
}
