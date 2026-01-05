import type { IconName } from "metabase/ui";

import type { ItemType } from "./types";

export const UNNAMED_SCHEMA_NAME = "";

export const TYPE_ICONS: Record<ItemType, IconName> = {
  table: "table2",
  schema: "folder",
  database: "database",
};
