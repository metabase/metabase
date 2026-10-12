import type {
  SessionEndReason,
  SessionProvider,
  SessionSortColumn,
  SortDirection,
} from "metabase-types/api";

export type RouteParams = {
  sessionId?: string;
};

export const SESSIONS_TABS = ["active", "ended"] as const;
export type SessionsTab = (typeof SESSIONS_TABS)[number];

export const SESSIONS_TIME_PRESETS = ["hour", "day", "week", "month"] as const;
export type SessionsTimePreset = (typeof SESSIONS_TIME_PRESETS)[number];

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
