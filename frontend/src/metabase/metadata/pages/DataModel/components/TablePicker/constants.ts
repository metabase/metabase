import type { IconName } from "metabase/ui";

import type { ItemType } from "./types";

export const UNNAMED_SCHEMA_NAME = "";

export const CHILD_TYPES: Record<ItemType, ItemType | null> = {
  database: "schema",
  schema: "table",
  table: null,
  collection: "model",
  model: null,
} as const;

export const TYPE_ICONS: Record<ItemType, IconName> = {
  database: "database",
  schema: "folder",
  table: "table2",
  collection: "collection",
  model: "model",
};

export const LEAF_ITEM_ICON_COLOR = "var(--mb-color-border-interactive)";
