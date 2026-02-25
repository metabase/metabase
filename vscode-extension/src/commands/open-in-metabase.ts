import {useCommand} from "reactive-vscode"
import {env, Uri, window} from "vscode"

import type {CatalogNode, ContentNode} from "../metabase-lib"
import {config} from "../config"

export const CONTENT_KIND_TO_MODEL: Record<ContentNode["kind"], string> = {
  card: "Card",
  dashboard: "Dashboard",
  collection: "Collection",
  native_query_snippet: "NativeQuerySnippet",
  timeline: "Timeline",
  document: "Document",
  transform: "Transform",
  action: "Action",
}

export function getGraphNodeKey(node: ContentNode | CatalogNode): string | null {
  if (node.kind === "table") {
    return `Table:${node.name}`
  }
  if (node.kind === "measure" || node.kind === "segment") {
    return `${node.kind === "measure" ? "Measure" : "Segment"}:${node.entityId}`
  }
  if (node.kind in CONTENT_KIND_TO_MODEL) {
    const contentNode = node as ContentNode
    return `${CONTENT_KIND_TO_MODEL[contentNode.kind]}:${contentNode.entityId}`
  }
  return null
}

export function registerOpenInMetabaseCommand() {
  useCommand("metastudio.openInMetabase", (node: ContentNode | CatalogNode) => {
    const host = config.host
    if (!host) {
      window.showErrorMessage(
        'Metabase host is not configured. Set it in Settings under "metastudio.host".',
      )
      return
    }

    const baseUrl = host.replace(/\/+$/, "")
    let urlPath: string

    switch (node.kind) {
      case "card":
        urlPath = `/question/entity/${node.entityId}`
        break
      case "dashboard":
        urlPath = `/dashboard/entity/${node.entityId}`
        break
      case "collection":
        urlPath = `/collection/entity/${node.entityId}`
        break
      case "transform":
        urlPath = `/data-studio/transforms/entity/${node.entityId}`
        break
      case "database": {
        const params = new URLSearchParams({database: node.name})
        urlPath = `/data-studio/data/by-name?${params.toString()}`
        break
      }
      case "schema": {
        const params = new URLSearchParams({
          database: node.databaseName,
          schema: node.name,
        })
        urlPath = `/data-studio/data/by-name?${params.toString()}`
        break
      }
      case "table": {
        const params = new URLSearchParams({
          database: node.databaseName,
          schema: node.schemaName,
          table: node.name,
        })
        urlPath = `/data-studio/data/by-name?${params.toString()}`
        break
      }
      case "field": {
        const params = new URLSearchParams({
          database: node.databaseName,
          schema: node.schemaName,
          table: node.tableName,
          field: node.name,
        })
        urlPath = `/data-studio/data/by-name?${params.toString()}`
        break
      }
      default:
        return
    }

    env.openExternal(Uri.parse(`${baseUrl}${urlPath}`))
  })
}
