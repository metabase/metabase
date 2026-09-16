import type { AdminSessionSortColumn, SortDirection } from "metabase-types/api";

export type RouteParams = {
  sessionId?: string;
};

export type SessionsUrlState = {
  page: number;
  query: string;
  sort_column: AdminSessionSortColumn;
  sort_direction: SortDirection;
};
