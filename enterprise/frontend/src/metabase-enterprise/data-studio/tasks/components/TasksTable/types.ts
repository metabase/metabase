import type { ColumnOptions } from "metabase/data-grid/types";

export type TableColumnOptions<
  TData,
  TColumn extends string,
> = ColumnOptions<TData> & {
  id: TColumn;
};

export type TableSortDirection = "asc" | "desc";
