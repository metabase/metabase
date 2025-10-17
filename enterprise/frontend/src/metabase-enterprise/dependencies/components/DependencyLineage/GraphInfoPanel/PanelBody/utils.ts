import { msgid, ngettext } from "ttag";

import type { DependencyNode } from "metabase-types/api";

export function getNodeCreatedAt(node: DependencyNode) {
  return node.type === "card" ? node.data.created_at : undefined;
}

export function getNodeCreatedBy(node: DependencyNode) {
  return node.type === "card" ? node.data.creator : undefined;
}

export function getNodeLastEditedAt(node: DependencyNode) {
  return node.type === "card"
    ? node.data["last-edit-info"]?.timestamp
    : undefined;
}

export function getNodeLastEditedBy(node: DependencyNode) {
  return node.type === "card" ? node.data["last-edit-info"] : undefined;
}

export function getNodeFields(node: DependencyNode) {
  return node.type === "card" ? (node.data.result_metadata ?? []) : [];
}

export function getNodeFieldsLabel(fieldCount: number) {
  return ngettext(
    msgid`${fieldCount} field`,
    `${fieldCount} fields`,
    fieldCount,
  );
}
