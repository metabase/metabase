export type TableSortDirection = "asc" | "desc";

export type TableSortOptions<TColumn> = {
  column: TColumn;
  direction: TableSortDirection;
};
