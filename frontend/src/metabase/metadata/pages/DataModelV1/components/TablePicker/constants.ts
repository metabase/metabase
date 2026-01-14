import type { IconName } from "metabase/ui";

import type { ItemType } from "./types";

export const UNNAMED_SCHEMA_NAME = "";

export const CHILD_TYPES = {
  database: "schema",
  schema: "table",
  table: null,
} as const;

export const TYPE_ICONS: Record<ItemType, IconName> = {
  table: "table2",
  schema: "folder_database",
  database: "database",
};
