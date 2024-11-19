export type SortColumn =
  | "name"
  | "last_edited_at"
  | "last_edited_by"
  | "last_used_at"
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
