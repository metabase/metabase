import type { Metabase_Lib_Schema_OrderBy_Direction } from "cljs/metabase.lib.js";

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
// Using the generated type from CLJS schema
export type SortDirection = Metabase_Lib_Schema_OrderBy_Direction;

export type SortingOptions<SortColumn extends string> = {
  sort_column: SortColumn;
  sort_direction: SortDirection;
};
