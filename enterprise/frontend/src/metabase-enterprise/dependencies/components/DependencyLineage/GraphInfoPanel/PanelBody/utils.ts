import { match } from "ts-pattern";
import { msgid, ngettext } from "ttag";

import * as Urls from "metabase/lib/urls";
import { getDependencyLineageUrl } from "metabase-enterprise/dependencies/urls";
import type { DependencyNode } from "metabase-types/api";

import type { LinkWithLabelInfo } from "../../types";

export function getNodeCreatedAt(node: DependencyNode) {
  return match(node)
    .with({ type: "card" }, (node) => node.data.created_at)
    .otherwise(() => undefined);
}

export function getNodeCreatedBy(node: DependencyNode) {
  return match(node)
    .with({ type: "card" }, (node) => node.data.creator)
    .otherwise(() => undefined);
}

export function getNodeLastEditedAt(node: DependencyNode) {
  return match(node)
    .with({ type: "card" }, (node) => node.data["last-edit-info"]?.timestamp)
    .otherwise(() => undefined);
}

export function getNodeLastEditedBy(node: DependencyNode) {
  return match(node)
    .with({ type: "card" }, (node) => node.data["last-edit-info"])
    .otherwise(() => undefined);
}

export function getNodeDatabaseInfo(
  node: DependencyNode,
): LinkWithLabelInfo | undefined {
  const database = match(node)
    .with({ type: "table" }, (node) => node.data.db)
    .with({ type: "transform" }, (node) => node.data.table?.db)
    .otherwise(() => undefined);

  if (database != null) {
    return {
      label: database.name,
      icon: "database",
      url: Urls.dataModelDatabase(database.id),
    };
  }
}

export function getNodeSchemaInfo(
  node: DependencyNode,
): LinkWithLabelInfo | undefined {
  const tableInfo = match(node)
    .with({ type: "table" }, (node) => node.data)
    .with({ type: "transform" }, (node) => node.data.table)
    .otherwise(() => undefined);

  if (
    tableInfo != null &&
    tableInfo.schema != null &&
    tableInfo.schema !== ""
  ) {
    return {
      label: tableInfo.schema,
      icon: "schema",
      url: Urls.dataModelSchema(tableInfo.db_id, tableInfo.schema),
    };
  }
}

export function getNodeGeneratedTableInfo(
  node: DependencyNode,
): LinkWithLabelInfo | undefined {
  const tableInfo = match(node)
    .with({ type: "transform" }, (node) => node.data.table)
    .otherwise(() => undefined);

  if (tableInfo != null && typeof tableInfo.id === "number") {
    return {
      label: tableInfo.display_name,
      icon: "table",
      url: getDependencyLineageUrl({
        entry: { id: tableInfo.id, type: "table" },
      }),
    };
  }
}

export function getNodeFields(node: DependencyNode) {
  return match(node)
    .with({ type: "card" }, (node) => node.data.result_metadata ?? [])
    .with({ type: "table" }, (node) => node.data.fields ?? [])
    .with({ type: "transform" }, (node) => node.data.table?.fields ?? [])
    .otherwise(() => []);
}

export function getNodeFieldsLabel(fieldCount: number) {
  return ngettext(
    msgid`${fieldCount} field`,
    `${fieldCount} fields`,
    fieldCount,
  );
}
