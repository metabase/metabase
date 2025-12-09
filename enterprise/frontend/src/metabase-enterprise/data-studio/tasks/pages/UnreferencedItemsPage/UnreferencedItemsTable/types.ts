import type { ColumnOptions } from "metabase/data-grid/types";
import type { UnreferencedItem } from "metabase-types/api";

export type UnreferencedItemColumn = "name" | "last-edit-at" | "last-edit-by";

export type UnreferencedItemColumnOptions = ColumnOptions<
  UnreferencedItem,
  unknown,
  UnreferencedItemColumn
>;
