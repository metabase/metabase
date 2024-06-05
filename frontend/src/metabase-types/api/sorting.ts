export enum SortDirection {
  Asc = "asc",
  Desc = "desc",
}

export type SortingOptions = {
  sort_column: string;
  sort_direction: SortDirection;
};
