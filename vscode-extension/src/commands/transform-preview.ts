import * as fs from "node:fs/promises"
import {useCommand} from "reactive-vscode"
import {parse as parseYaml} from "yaml"
import {commands, Uri, ViewColumn, window, workspace} from "vscode"
import type {FileSystemWatcher} from "vscode"

import type {TransformNode} from "../metabase-lib"
import type {TransformPreviewData} from "../transform-preview-html"
import type {ExtensionCtx} from "../extension-context"

import {getTransformPreviewHtml} from "../transform-preview-html"
import {parseTransformQuery, parseTransformTarget} from "../transform-query"
import {showDependencyGraph} from "./dependency-graph"

function generateNonce(): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let text = ""
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

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

    const nonce = generateNonce()
    const html = getTransformPreviewHtml(data, nonce)
    panel.title = updatedNode.name
    panel.webview.html = html
  } catch {
    // File may have been deleted or be temporarily unreadable; ignore
  }
}

async function handleTransformMessage(ctx: ExtensionCtx, message: Record<string, unknown>) {
  switch (message.type) {
    case "openFile": {
      const filePath = message.filePath as string | undefined
      if (filePath) {
        window.showTextDocument(Uri.file(filePath))
      }
      break
    }
    case "openGraph": {
      const entityId = message.entityId as string | undefined
      if (entityId) {
        await showDependencyGraph(ctx, `Transform:${entityId}`)
      } else {
        await showDependencyGraph(ctx)
      }
      break
    }
    case "openTable": {
      const tableRef = message.ref as string[] | undefined
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
      const filePath = message.filePath as string | undefined
      const lang = message.lang as string | undefined
      const name = message.name as string | undefined
      if (filePath && lang && name) {
        commands.executeCommand("metastudio.openEmbeddedCode", {filePath, lang, name})
      }
      break
    }
    case "openField": {
      const fieldRef = message.ref as string[] | undefined
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
    const nonce = generateNonce()
    const html = getTransformPreviewHtml(data, nonce)

    if (ctx.panels.transformPanel) {
      ctx.panels.transformPanel.title = node.name
      ctx.panels.transformPanel.webview.html = html
      ctx.panels.transformPanel.reveal(ViewColumn.One, true)
    } else {
      const panel = window.createWebviewPanel(
        "metabaseTransformPreview",
        node.name,
        {viewColumn: ViewColumn.One, preserveFocus: true},
        {enableScripts: true},
      )
      panel.webview.html = html
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
