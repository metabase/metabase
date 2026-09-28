import type {
  SessionEndReason,
  SessionProvider,
  SessionSortColumn,
  SortDirection,
} from "metabase-types/api";

export type RouteParams = {
  sessionId?: string;
};

export type SessionsTab = "active" | "ended";

export type SessionsTimePreset = "hour" | "day" | "week" | "month";

export type SessionsUrlState = {
  page: number;
  query: string;
  tab: SessionsTab;
  provider: SessionProvider[];
  last_active: SessionsTimePreset | null;
  ended: SessionsTimePreset | null;
  reason: SessionEndReason | null;
  sort_column: SessionSortColumn;
  sort_direction: SortDirection;
};
