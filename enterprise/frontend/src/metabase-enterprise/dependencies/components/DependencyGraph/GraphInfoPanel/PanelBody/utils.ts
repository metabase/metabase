import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import type { NodeTableInfo } from "./types";

export function getNodeTableInfo(
  node: DependencyNode,
  getGraphUrl: (entry: DependencyEntry) => string,
): NodeTableInfo | null {
  if (node.type !== "transform" && node.type !== "sandbox") {
    return null;
  }

  const table = node.data.table;
  if (table == null || typeof table.id !== "number") {
    return null;
  }

  return {
    label: node.type === "transform" ? t`Generated table` : t`Restricted table`,
    title: {
      label: table.display_name,
      url: getGraphUrl({ id: table.id, type: "table" }),
    },
    metadata: {
      label: t`View metadata`,
      url: Urls.dataModel({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: table.id,
      }),
    },
    location: table.db
      ? [
          {
            label: table.db.name,
            url: Urls.dataModel({ databaseId: table.db.id }),
          },
          {
            label: table.schema,
            url: Urls.dataModel({
              databaseId: table.db.id,
              schemaName: table.schema,
            }),
          },
        ]
      : null,
  };
}
<<<<<<< HEAD

export function getNodeFields(node: DependencyNode): Field[] {
  switch (node.type) {
    case "card":
      return node.data.result_metadata ?? [];
    case "table":
      return node.data.fields ?? [];
    case "transform":
    case "sandbox":
      return node.data.table?.fields ?? [];
    case "workspace-transform":
    case "snippet":
    case "dashboard":
    case "document":
    case "segment":
    case "measure":
      return [];
  }
}

export function getNodeFieldsLabel(fieldCount: number) {
  return ngettext(
    msgid`${fieldCount} field`,
    `${fieldCount} fields`,
    fieldCount,
  );
}
=======
>>>>>>> master
