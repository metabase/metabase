export type SortColumn =
  | "name"
  | "last_edited_at"
  | "last_edited_by"
  | "last_used_at"
  | "model"
  | "collection"
  | "description"
  | "fileName"
  | "creation date"
  | "last update"
  | "type"
  | "category"
  | "title"
  | "verified_status"
  | "in_semantic_layer"
  | "user"
  | "admin_user"
  | "updated_at"
  | "action";

export enum SortDirection {
  Asc = "asc",
  Desc = "desc",
}

export type SortingOptions = {
  sort_column: SortColumn;
  sort_direction: SortDirection;
};
