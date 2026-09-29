import type {
  SessionSortColumn,
  SessionStatusFilter,
  SortDirection,
} from "metabase-types/api";

import type { SessionsTab } from "./types";

export const PAGE_SIZE = 50;

export const DEFAULT_TAB: SessionsTab = "active";

export const TAB_STATUS: Record<SessionsTab, SessionStatusFilter> = {
  active: "live",
  ended: "ended",
};

export const DEFAULT_SORT_COLUMN: SessionSortColumn = "created_at";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

export const SORT_COLUMN_VALUES: SessionSortColumn[] = [
  "created_at",
  "user_email",
  "provider",
];
