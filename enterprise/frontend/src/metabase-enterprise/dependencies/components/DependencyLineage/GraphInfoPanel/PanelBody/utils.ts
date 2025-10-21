import { P, match } from "ts-pattern";
import { msgid, ngettext } from "ttag";

import * as Urls from "metabase/lib/urls";
import type { NodeLink } from "metabase-enterprise/dependencies/components/DependencyLineage/types";
import type { DependencyNode } from "metabase-types/api";

export function getNodeCreatedAt(node: DependencyNode) {
  return match(node)
    .with({ type: "card" }, (node) => node.data.created_at)
    .with({ type: P.union("table", "transform", "snippet") }, () => undefined)
    .exhaustive();
}

export function getNodeCreatedBy(node: DependencyNode) {
  return match(node)
    .with({ type: "card" }, (node) => node.data.creator)
    .with({ type: P.union("table", "transform", "snippet") }, () => undefined)
    .exhaustive();
}

export function getNodeLastEditedAt(node: DependencyNode) {
  return match(node)
    .with({ type: "card" }, (node) => node.data["last-edit-info"]?.timestamp)
    .with({ type: P.union("table", "transform", "snippet") }, () => undefined)
    .exhaustive();
}

export function getNodeLastEditedBy(node: DependencyNode) {
  return match(node)
    .with({ type: "card" }, (node) => node.data["last-edit-info"])
    .with({ type: P.union("table", "transform", "snippet") }, () => undefined)
    .exhaustive();
}

export function getNodeGeneratedTableInfo(
  node: DependencyNode,
): NodeLink | undefined {
  const tableInfo = match(node)
    .with({ type: "transform" }, (node) => node.data.table)
    .with({ type: P.union("card", "table", "snippet") }, () => undefined)
    .exhaustive();

  if (tableInfo != null && typeof tableInfo.id === "number") {
    return {
      label: tableInfo.display_name,
      url: Urls.dataModelTable(tableInfo.db_id, tableInfo.schema, tableInfo.id),
    };
  }
}

export function getNodeFields(node: DependencyNode) {
  return match(node)
    .with({ type: "card" }, (node) => node.data.result_metadata ?? [])
    .with({ type: "table" }, (node) => node.data.fields ?? [])
    .with({ type: "transform" }, (node) => node.data.table?.fields ?? [])
    .with({ type: P.union("snippet") }, () => [])
    .exhaustive();
}

export function getNodeFieldsLabel(fieldCount: number) {
  return ngettext(
    msgid`${fieldCount} field`,
    `${fieldCount} fields`,
    fieldCount,
  );
}
