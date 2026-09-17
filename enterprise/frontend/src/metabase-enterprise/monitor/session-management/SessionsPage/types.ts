import type {
  AdminSessionProvider,
  AdminSessionSortColumn,
  SortDirection,
} from "metabase-types/api";

export type RouteParams = {
  sessionId?: string;
};

export type SessionsLastActive = "hour" | "day" | "week" | "month";

export type SessionsUrlState = {
  page: number;
  query: string;
  provider: AdminSessionProvider[];
  last_active: SessionsLastActive | null;
  sort_column: AdminSessionSortColumn;
  sort_direction: SortDirection;
};
