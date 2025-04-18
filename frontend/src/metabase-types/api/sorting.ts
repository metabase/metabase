export type SortColumn<ColumnName extends string = string> = ColumnName;

export enum SortDirection {
  Asc = "asc",
  Desc = "desc",
}

export type SortingOptions<ColumnName extends string = string> = {
  sort_column: SortColumn<ColumnName>;
  sort_direction: SortDirection;
};
