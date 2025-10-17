import { P, match } from "ts-pattern";

import * as Urls from "metabase/lib/urls";
import type { DependencyNode } from "metabase-types/api";

import type { NodeLocationInfo } from "./types";

export function getCreatedAt(node: DependencyNode) {
  return node.type === "card" ? node.data.created_at : undefined;
}

export function getCreatedBy(node: DependencyNode) {
  return node.type === "card" ? node.data.creator : undefined;
}

export function getLastEditedAt(node: DependencyNode) {
  return node.type === "card"
    ? node.data["last-edit-info"]?.timestamp
    : undefined;
}

export function getLastEditedBy(node: DependencyNode) {
  return node.type === "card" ? node.data["last-edit-info"] : undefined;
}

export function getLocationInfo(
  node: DependencyNode,
): NodeLocationInfo | undefined {
  return match<DependencyNode, NodeLocationInfo | undefined>(node)
    .with({ type: "card", data: { dashboard: P.nonNullable } }, (node) => ({
      label: node.data.dashboard.name,
      icon: "dashboard",
      link: Urls.dashboard(node.data.dashboard),
    }))
    .with({ type: "card", data: { collection: P.nonNullable } }, (node) => ({
      label: node.data.collection.name,
      icon: "folder",
      link: Urls.dashboard(node.data.collection),
    }))
    .otherwise(() => undefined);
}
