import type {
  AdminSessionEndReason,
  AdminSessionProvider,
  AdminSessionSortColumn,
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
  provider: AdminSessionProvider[];
  last_active: SessionsTimePreset | null;
  ended: SessionsTimePreset | null;
  reason: AdminSessionEndReason | null;
  sort_column: AdminSessionSortColumn;
  sort_direction: SortDirection;
};
