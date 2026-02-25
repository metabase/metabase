import * as fs from "node:fs/promises"
import {useCommand} from "reactive-vscode"
import {parse as parseYaml} from "yaml"
import {commands, Uri, ViewColumn, window, workspace} from "vscode"
import type {FileSystemWatcher} from "vscode"

import type {TransformNode} from "../metabase-lib"
import type {TransformPreviewData, PreviewToExtensionMessage} from "../shared-types"
import type {ExtensionCtx} from "../extension-context"

import {parseTransformQuery, parseTransformTarget} from "../transform-query"
import {getPreviewWebviewHtml} from "../webview-html"
import {showDependencyGraph} from "./dependency-graph"

function buildTransformPreviewData(
  ctx: ExtensionCtx,
  node: TransformNode,
): TransformPreviewData {
  ctx.panels.currentTransformNode = node
  return {
    name: node.name,
    description: node.description,
    query: parseTransformQuery(node.raw),
    target: parseTransformTarget(node.raw),
    filePath: node.filePath,
    entityId: node.entityId,
    sourceQueryType: node.sourceQueryType,
  }
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

async function refreshPreview(ctx: ExtensionCtx) {
  const panel = ctx.panels.transformPanel
  const currentNode = ctx.panels.currentTransformNode
  if (!panel || !currentNode) return

  try {
    const content = await fs.readFile(currentNode.filePath, "utf-8")
    const raw = parseYaml(content) as Record<string, unknown>
    if (!raw || typeof raw !== "object") return

    const source = raw.source as Record<string, unknown> | undefined
    const query = source?.query as Record<string, unknown> | undefined
    const queryType = query?.type as string | undefined

    const updatedNode: TransformNode = {
      kind: "transform",
      entityId: String(raw.entity_id ?? currentNode.entityId),
      name: String(raw.name ?? currentNode.name),
      description: strOrNull(raw.description),
      sourceDatabaseId: strOrNull(raw.source_database_id),
      sourceQueryType: (queryType === "native" || queryType === "query" || queryType === "python") ? queryType : null,
      collectionId: strOrNull(raw.collection_id),
      filePath: currentNode.filePath,
      raw,
    }

    ctx.panels.currentTransformNode = updatedNode

    const data: TransformPreviewData = {
      name: updatedNode.name,
      description: updatedNode.description,
      query: parseTransformQuery(raw),
      target: parseTransformTarget(raw),
      filePath: updatedNode.filePath,
      entityId: updatedNode.entityId,
      sourceQueryType: updatedNode.sourceQueryType,
    }

    panel.title = updatedNode.name
    panel.webview.postMessage({ type: "previewUpdate", data })
  } catch {
    // File may have been deleted or be temporarily unreadable; ignore
  }
}

async function handleTransformMessage(ctx: ExtensionCtx, message: PreviewToExtensionMessage) {
  switch (message.type) {
    case "ready": {
      const currentNode = ctx.panels.currentTransformNode
      if (currentNode && ctx.panels.transformPanel) {
        const data = buildTransformPreviewData(ctx, currentNode)
        ctx.panels.transformPanel.webview.postMessage({ type: "previewInit", data })
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
      if (message.entityId) {
        await showDependencyGraph(ctx, `Transform:${message.entityId}`)
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
    case "runTransform": {
      if (ctx.panels.currentTransformNode) {
        commands.executeCommand("metastudio.runTransform", ctx.panels.currentTransformNode)
      }
      break
    }
    case "editInEditor": {
      if (message.filePath && message.lang && message.name) {
        commands.executeCommand("metastudio.openEmbeddedCode", {
          filePath: message.filePath,
          lang: message.lang,
          name: message.name,
        })
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

export function registerTransformPreviewCommand(ctx: ExtensionCtx) {
  let currentWatcher: FileSystemWatcher | null = null

  function watchTransformFile(filePath: string) {
    if (currentWatcher) currentWatcher.dispose()
    currentWatcher = workspace.createFileSystemWatcher(filePath)
    currentWatcher.onDidChange(() => refreshPreview(ctx))
  }

  useCommand("metastudio.showTransformPreview", (node: TransformNode) => {
    const data = buildTransformPreviewData(ctx, node)

    if (ctx.panels.transformPanel) {
      ctx.panels.transformPanel.title = node.name
      ctx.panels.transformPanel.webview.postMessage({ type: "previewInit", data })
      ctx.panels.transformPanel.reveal(ViewColumn.One, true)
    } else {
      const extensionUri = Uri.file(ctx.extensionPath)
      const panel = window.createWebviewPanel(
        "metabaseTransformPreview",
        node.name,
        {viewColumn: ViewColumn.One, preserveFocus: true},
        {
          enableScripts: true,
          localResourceRoots: [Uri.joinPath(extensionUri, "dist", "webview")],
        },
      )
      panel.webview.html = getPreviewWebviewHtml(panel.webview, extensionUri)
      ctx.panels.transformPanel = panel

      panel.webview.onDidReceiveMessage((msg) => handleTransformMessage(ctx, msg))

      panel.onDidDispose(() => {
        ctx.panels.transformPanel = null
        if (currentWatcher) {
          currentWatcher.dispose()
          currentWatcher = null
        }
      })
    }

    watchTransformFile(node.filePath)
  })
}
