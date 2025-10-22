import { P, match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import * as Urls from "metabase/lib/urls";
import type { DependencyNode } from "metabase-types/api";

import type { NodeTableInfo } from "./types";

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

export function getNodeTableInfo(
  node: DependencyNode,
): NodeTableInfo | undefined {
  const table = match(node)
    .with({ type: "transform" }, (node) => node.data.table)
    .with({ type: P.union("card", "table", "snippet") }, () => undefined)
    .exhaustive();

  if (table == null || typeof table.id !== "number") {
    return;
  }

  return {
    title: {
      label: table.display_name,
      url: Urls.dependencyLineage({ entry: { id: table.id, type: "table" } }),
    },
    metadata: {
      label: t`View metadata`,
      url: Urls.dataModelTable(table.db_id, table.schema, table.id),
    },
    location: table.db && {
      icon: "database",
      parts: [
        {
          label: table.db.name,
          url: Urls.dataModelDatabase(table.db.id),
        },
        {
          label: table.schema,
          url: Urls.dataModelSchema(table.db.id, table.schema),
        },
      ],
    },
  };
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
