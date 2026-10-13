import type {
  SessionSortColumn,
  SessionStatusFilter,
  SortDirection,
} from "metabase-types/api";

import type { SessionsTab } from "./types";

export { PAGE_SIZE } from "metabase/monitor/constants";

export const DEFAULT_TAB: SessionsTab = "active";

export const TAB_STATUS: Record<SessionsTab, SessionStatusFilter> = {
  active: "live",
  ended: "ended",
};

export const DEFAULT_SORT_COLUMN: SessionSortColumn = "created_at";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

// The ended tab has no auth method column, so it can't sort by one
export const TAB_SORT_COLUMNS: Record<SessionsTab, SessionSortColumn[]> = {
  active: ["created_at", "user_email", "provider"],
  ended: ["created_at", "user_email"],
};
