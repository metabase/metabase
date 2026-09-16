import type { AdminSessionSortColumn, SortDirection } from "metabase-types/api";

export const PAGE_SIZE = 50;

export const DEFAULT_SORT_COLUMN: AdminSessionSortColumn = "created_at";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

export const SORT_COLUMN_VALUES: AdminSessionSortColumn[] = [
  "created_at",
  "user_email",
  "provider",
];
