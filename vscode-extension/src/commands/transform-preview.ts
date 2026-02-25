import {useCommand} from "reactive-vscode"
import {commands, Uri, ViewColumn, window} from "vscode"

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
      })
    }
  })
}
