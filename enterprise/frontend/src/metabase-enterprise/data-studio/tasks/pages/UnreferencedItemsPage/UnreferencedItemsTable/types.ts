import type { TableColumnOptions } from "metabase-enterprise/data-studio/tasks/components/TasksTable/types";
import type { UnreferencedItem } from "metabase-types/api";

export type UnreferencedItemColumnId = "name" | "last-edit-at" | "last-edit-by";

export type UnreferencedItemColumnOptions = TableColumnOptions<
  UnreferencedItem,
  UnreferencedItemColumnId
>;
