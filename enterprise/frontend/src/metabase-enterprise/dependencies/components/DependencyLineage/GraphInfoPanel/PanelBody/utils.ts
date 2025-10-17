import type { DependencyNode } from "metabase-types/api";

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
