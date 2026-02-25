import * as fs from "node:fs/promises"
import {useCommand} from "reactive-vscode"
import {parse as parseYaml} from "yaml"
import {Uri, ViewColumn, window, workspace} from "vscode"
import type {FileSystemWatcher} from "vscode"

import type {CardNode, TransformNode} from "../metabase-lib"
import type {NotebookData, NotebookToExtensionMessage} from "../shared-types"
import type {ExtensionCtx} from "../extension-context"

import {buildNotebookDataFromCard, buildNotebookDataFromTransform} from "../metabase-lib/question-builder"
import {getNotebookWebviewHtml} from "../webview-html"
import {showDependencyGraph} from "./dependency-graph"

type NotebookSource = CardNode | TransformNode

function buildNotebookData(
  ctx: ExtensionCtx,
  node: NotebookSource,
): NotebookData {
  ctx.panels.currentNotebookNode = node
  const catalog = ctx.panels.currentCatalog
  if (node.kind === "transform") {
    return buildNotebookDataFromTransform(node, catalog)
  }
  return buildNotebookDataFromCard(node, catalog)
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

async function refreshNotebook(ctx: ExtensionCtx) {
  const panel = ctx.panels.notebookPanel
  const currentNode = ctx.panels.currentNotebookNode
  if (!panel || !currentNode) return

  try {
    const content = await fs.readFile(currentNode.filePath, "utf-8")
    const raw = parseYaml(content) as Record<string, unknown>
    if (!raw || typeof raw !== "object") return

    let updatedNode: NotebookSource
    if (currentNode.kind === "transform") {
      const source = raw.source as Record<string, unknown> | undefined
      const query = source?.query as Record<string, unknown> | undefined
      const queryType = query?.type as string | undefined

      updatedNode = {
        kind: "transform",
        entityId: String(raw.entity_id ?? currentNode.entityId),
        name: String(raw.name ?? currentNode.name),
        description: strOrNull(raw.description),
        sourceDatabaseId: strOrNull(raw.source_database_id),
        sourceQueryType:
          queryType === "native" || queryType === "query" || queryType === "python"
            ? queryType
            : null,
        collectionId: strOrNull(raw.collection_id),
        filePath: currentNode.filePath,
        raw,
      }
    } else {
      updatedNode = {
        ...currentNode,
        name: String(raw.name ?? currentNode.name),
        description: strOrNull(raw.description),
        raw,
      }
    }

    ctx.panels.currentNotebookNode = updatedNode

    const catalog = ctx.panels.currentCatalog
    const data =
      updatedNode.kind === "transform"
        ? buildNotebookDataFromTransform(updatedNode, catalog)
        : buildNotebookDataFromCard(updatedNode, catalog)

    panel.title = updatedNode.name
    panel.webview.postMessage({type: "notebookUpdate", data})
  } catch {
    // File may have been deleted or be temporarily unreadable
  }
}

async function handleNotebookMessage(
  ctx: ExtensionCtx,
  message: NotebookToExtensionMessage,
) {
  switch (message.type) {
    case "ready": {
      const currentNode = ctx.panels.currentNotebookNode
      if (currentNode && ctx.panels.notebookPanel) {
        const data = buildNotebookData(ctx, currentNode)
        ctx.panels.notebookPanel.webview.postMessage({type: "notebookInit", data})
      }
      break
    }
    case "openFile": {
      if (message.filePath) {
        window.showTextDocument(Uri.file(message.filePath))
      }
      break
    }
    case "openGraph": {
      const entityId = message.entityId
      const currentNode = ctx.panels.currentNotebookNode
      if (entityId) {
        const kind = currentNode?.kind === "transform" ? "Transform" : "Card"
        await showDependencyGraph(ctx, `${kind}:${entityId}`)
      } else {
        await showDependencyGraph(ctx)
      }
      break
    }
    case "openTable": {
      const tableRef = message.ref
      if (!tableRef || tableRef.length < 3 || !ctx.panels.currentCatalog) break
      const tableNode = ctx.panels.currentCatalog.getTable(
        tableRef[0],
        tableRef[1],
        tableRef[2],
      )
      if (tableNode?.filePath) {
        window.showTextDocument(Uri.file(tableNode.filePath))
      }
      break
    }
    case "openField": {
      const fieldRef = message.ref
      if (!fieldRef || fieldRef.length < 4 || !ctx.panels.currentCatalog) break
      const table = ctx.panels.currentCatalog.getTable(
        fieldRef[0],
        fieldRef[1],
        fieldRef[2],
      )
      const field = table?.fields.find(
        (fieldNode) => fieldNode.name === fieldRef[3],
      )
      if (field?.filePath) {
        window.showTextDocument(Uri.file(field.filePath))
      } else if (table?.filePath) {
        window.showTextDocument(Uri.file(table.filePath))
      }
      break
    }
  }
}

export function registerNotebookViewCommand(ctx: ExtensionCtx) {
  let currentWatcher: FileSystemWatcher | null = null

  function watchFile(filePath: string) {
    if (currentWatcher) currentWatcher.dispose()
    currentWatcher = workspace.createFileSystemWatcher(filePath)
    currentWatcher.onDidChange(() => refreshNotebook(ctx))
  }

  useCommand("metastudio.showNotebook", (node: NotebookSource) => {
    const data = buildNotebookData(ctx, node)

    if (ctx.panels.notebookPanel) {
      ctx.panels.notebookPanel.title = node.name
      ctx.panels.notebookPanel.webview.postMessage({type: "notebookInit", data})
      ctx.panels.notebookPanel.reveal(ViewColumn.One, true)
    } else {
      const extensionUri = Uri.file(ctx.extensionPath)
      const panel = window.createWebviewPanel(
        "metabaseNotebook",
        node.name,
        {viewColumn: ViewColumn.One, preserveFocus: true},
        {
          enableScripts: true,
          localResourceRoots: [Uri.joinPath(extensionUri, "dist", "webview")],
        },
      )
      panel.webview.html = getNotebookWebviewHtml(panel.webview, extensionUri)
      ctx.panels.notebookPanel = panel

      panel.webview.onDidReceiveMessage((msg) => handleNotebookMessage(ctx, msg))

      panel.onDidDispose(() => {
        ctx.panels.notebookPanel = null
        if (currentWatcher) {
          currentWatcher.dispose()
          currentWatcher = null
        }
      })
    }

    watchFile(node.filePath)
  })
}
