export type SortColumn =
  | "name"
  | "last_edited_at"
  | "last_edited_by"
  | "model"
  | "collection"
  | "description";

export enum SortDirection {
  Asc = "asc",
  Desc = "desc",
}

export type SortingOptions = {
  sort_column: SortColumn;
  sort_direction: SortDirection;
};
