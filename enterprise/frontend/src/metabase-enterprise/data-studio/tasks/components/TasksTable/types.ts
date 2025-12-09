export type TableSortDirection = "asc" | "desc";

export type TableSortOptions<TColumn> = {
  column: TColumn;
  direction: TableSortDirection;
};

export type TablePaginationOptions = {
  pageIndex: number;
  pageSize: number;
  total: number;
};
