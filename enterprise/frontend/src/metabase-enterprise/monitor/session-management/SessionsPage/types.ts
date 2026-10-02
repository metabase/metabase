import type { MonitorTimePreset } from "metabase/monitor/time-presets";
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

export type SessionsUrlState = {
  page: number;
  query: string;
  tab: SessionsTab;
  provider: SessionProvider[];
  last_active: MonitorTimePreset | null;
  ended: MonitorTimePreset | null;
  reason: SessionEndReason | null;
  sort_column: SessionSortColumn;
  sort_direction: SortDirection;
};
