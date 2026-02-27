import type {WebviewPanel} from "vscode"

import type {CatalogNode, ContentNode, DependencyGraphResult} from "../metabase-lib"
import type {WebviewToExtensionMessage} from "../shared-types"
import type {ExtensionCtx} from "../extension-context"

import {useCommand, useFileSystemWatcher} from "reactive-vscode"
import {
  commands,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Uri,
  ViewColumn,
  window,
} from "vscode"
import {buildGraphViewData} from "../graph-view-data"
import {buildDependencyGraph, CatalogGraph, ContentGraph, parseDirectory} from "../metabase-lib"
import {getWebviewHtml} from "../webview-html"
import {loadExport} from "../export-loader"
import {getGraphNodeKey} from "./open-in-metabase"

function publishDiagnostics(
  diagnosticCollection: ExtensionCtx["diagnosticCollection"],
  result: DependencyGraphResult,
) {
  diagnosticCollection.clear()
  const diagnosticsByFile = new Map<string, Diagnostic[]>()

  for (const issue of result.issues) {
    if (!issue.filePath) continue
    const severity =
      issue.severity === "error"
        ? DiagnosticSeverity.Error
        : DiagnosticSeverity.Warning
    const diagnostic = new Diagnostic(
      new Range(0, 0, 0, 0),
      issue.message,
      severity,
    )
    diagnostic.source = "metabase-dependencies"

    const existing = diagnosticsByFile.get(issue.filePath) ?? []
    existing.push(diagnostic)
    diagnosticsByFile.set(issue.filePath, existing)
  }

  for (const cycle of result.cycles) {
    const names = cycle.path.map((entity) => entity.name)
    const message = `Dependency cycle: ${names.join(" → ")} → ${names[0]}`
    for (const entity of cycle.path) {
      if (!entity.filePath) continue
      const diagnostic = new Diagnostic(
        new Range(0, 0, 0, 0),
        message,
        DiagnosticSeverity.Warning,
      )
      diagnostic.source = "metabase-dependencies"
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
      type: "init",
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
    const {nodes, edges} = buildGraphViewData(graphResult, entities)

    publishDiagnostics(ctx.diagnosticCollection, graphResult)

    panel.webview.postMessage({
      type: "init",
      configExists: true,
      nodes,
      edges,
      issueCount: graphResult.issues.length,
      cycleCount: graphResult.cycles.length,
    })

    if (ctx.panels.pendingFocusNodeKey) {
      panel.webview.postMessage({
        type: "focusNode",
        nodeKey: ctx.panels.pendingFocusNodeKey,
      })
      ctx.panels.pendingFocusNodeKey = null
    }
  } catch (error) {
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
        type: "focusNode",
        nodeKey: ctx.panels.pendingFocusNodeKey,
      })
      ctx.panels.pendingFocusNodeKey = null
    }
    return
  }

  const extensionUri = Uri.file(ctx.extensionPath)
  const panel = window.createWebviewPanel(
    "metabaseDependencyGraph",
    "Dependency Graph",
    ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [Uri.joinPath(extensionUri, "dist", "webview")],
    },
  )

  panel.webview.html = getWebviewHtml(panel.webview, extensionUri)
  ctx.panels.graphPanel = panel

  panel.webview.onDidReceiveMessage(
    async (message: WebviewToExtensionMessage) => {
      switch (message.type) {
        case "ready":
          await sendGraphDataToWebview(ctx, panel)
          break
        case "openFile":
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
  useCommand("metastudio.checkDependencyGraph", async () => {
    const folders = ctx.workspaceFolders.value
    if (!folders?.length) {
      window.showWarningMessage("No workspace folder open.")
      return
    }

    const rootPath = folders[0].uri.fsPath
    const configUri = Uri.joinPath(folders[0].uri, "metabase.config.json")
    try {
      const {workspace} = await import("vscode")
      await workspace.fs.stat(configUri)
    } catch {
      window.showWarningMessage(
        `No metabase.config.json found in workspace root.`,
      )
      return
    }

    await window.withProgress(
      {
        location: {viewId: "metabase.content"},
        title: "Checking dependency graph...",
      },
      async () => {
        try {
          const entities = await parseDirectory(rootPath)
          const catalog = CatalogGraph.build(entities)
          const content = ContentGraph.build(entities)
          const result = buildDependencyGraph(entities, catalog, content)

          publishDiagnostics(ctx.diagnosticCollection, result)

          const errorCount = result.issues.filter(
            (issue) => issue.severity === "error",
          ).length
          const warningCount = result.issues.filter(
            (issue) => issue.severity === "warning",
          ).length
          const cycleCount = result.cycles.length

          if (errorCount === 0 && warningCount === 0 && cycleCount === 0) {
            window.showInformationMessage(
              `Dependency check passed. ${result.entities.size} entities, ${result.edges.length} dependencies, no issues.`,
            )
          } else {
            commands.executeCommand("workbench.actions.view.problems")

            const parts: string[] = []
            if (errorCount > 0)
              parts.push(`${errorCount} error${errorCount > 1 ? "s" : ""}`)
            if (warningCount > 0)
              parts.push(
                `${warningCount} warning${warningCount > 1 ? "s" : ""}`,
              )
            if (cycleCount > 0)
              parts.push(`${cycleCount} cycle${cycleCount > 1 ? "s" : ""}`)
            const action = await window.showWarningMessage(
              `Dependency check: ${parts.join(", ")}.`,
              "Show Problems",
            )
            if (action === "Show Problems") {
              commands.executeCommand("workbench.actions.view.problems")
            }
          }
        } catch (error) {
          window.showErrorMessage(
            `Dependency check failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      },
    )
  })

  useCommand("metastudio.showDependencyGraph", () => showDependencyGraph(ctx))

  useCommand(
    "metastudio.showInDependencyGraph",
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
    if (!ctx.configExists.value) return
    const folders = ctx.workspaceFolders.value
    if (!folders?.length) return

    try {
      const rootPath = folders[0].uri.fsPath
      const entities = await parseDirectory(rootPath)
      const catalog = CatalogGraph.build(entities)
      const content = ContentGraph.build(entities)
      const result = buildDependencyGraph(entities, catalog, content)
      publishDiagnostics(ctx.diagnosticCollection, result)
    } catch {
      // silently fail for background checks
    }
  }

  function scheduleCheck() {
    if (checkDebounceTimer) clearTimeout(checkDebounceTimer)
    checkDebounceTimer = setTimeout(runDebouncedCheck, 1000)
  }

  function onYamlChanged() {
    loadExport(ctx)
    if (ctx.panels.graphPanel) sendGraphDataToWebview(ctx, ctx.panels.graphPanel)
    scheduleCheck()
  }

  useFileSystemWatcher("**/*.yaml", {
    onDidCreate: onYamlChanged,
    onDidChange: onYamlChanged,
    onDidDelete: onYamlChanged,
  })
}
