import type { ColumnOptions } from "metabase/data-grid/types";
import type { DependencyNode } from "metabase-types/api";

export type DependencyColumn =
  | "name"
  | "location"
  | "last-edit-at"
  | "last-edit-by";

export type DependencyColumnOptions = ColumnOptions<
  DependencyNode,
  unknown,
  DependencyColumn
>;
