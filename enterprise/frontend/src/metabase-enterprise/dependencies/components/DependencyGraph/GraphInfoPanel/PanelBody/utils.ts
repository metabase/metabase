import { msgid, ngettext, t } from "ttag";

import * as Urls from "metabase/lib/urls";
import type {
  CardCreatorInfo,
  DependencyNode,
  Field,
  LastEditInfo,
} from "metabase-types/api";

import type { NodeTableInfo } from "./types";

export function getNodeCreatedAt(node: DependencyNode): string | null {
  switch (node.type) {
    case "card":
    case "dashboard":
    case "document":
      return node.data.created_at;
    case "table":
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function getNodeCreatedBy(node: DependencyNode): CardCreatorInfo | null {
  switch (node.type) {
    case "card":
    case "dashboard":
    case "document":
      return node.data.creator ?? null;
    case "table":
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

export function getNodeLastEditedAt(node: DependencyNode): string | null {
  switch (node.type) {
    case "card":
    case "dashboard":
      return node.data["last-edit-info"]?.timestamp ?? null;
    case "table":
    case "transform":
    case "snippet":
    case "document":
    case "sandbox":
      return null;
  }
}

export function getNodeLastEditedBy(node: DependencyNode): LastEditInfo | null {
  switch (node.type) {
    case "card":
    case "dashboard":
      return node.data["last-edit-info"] ?? null;
    case "table":
    case "transform":
    case "snippet":
    case "document":
    case "sandbox":
      return null;
  }
}

export function getNodeTableInfo(node: DependencyNode): NodeTableInfo | null {
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
      url: Urls.dependencyGraph({ entry: { id: table.id, type: "table" } }),
    },
    metadata: {
      label: t`View metadata`,
      url: Urls.dataModelTable(table.db_id, table.schema, table.id),
    },
    location: table.db
      ? [
          {
            label: table.db.name,
            url: Urls.dataModelDatabase(table.db.id),
          },
          {
            label: table.schema,
            url: Urls.dataModelSchema(table.db.id, table.schema),
          },
        ]
      : null,
  };
}

export function getNodeFields(node: DependencyNode): Field[] {
  switch (node.type) {
    case "card":
      return node.data.result_metadata ?? [];
    case "table":
      return node.data.fields ?? [];
    case "transform":
    case "sandbox":
      return node.data.table?.fields ?? [];
    case "snippet":
    case "dashboard":
    case "document":
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
