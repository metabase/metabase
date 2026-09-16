import type {
  AdminSessionProvider,
  AdminSessionSortColumn,
  SortDirection,
} from "metabase-types/api";

export type RouteParams = {
  sessionId?: string;
};

export type SessionsUrlState = {
  page: number;
  query: string;
  provider: AdminSessionProvider[];
  sort_column: AdminSessionSortColumn;
  sort_direction: SortDirection;
};
