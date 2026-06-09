import type {
  AdminNotificationSortColumn,
  NotificationChannelType,
  NotificationRunStatus,
  SortDirection,
} from "metabase-types/api";

import type { NotificationsTab, TabFilters } from "./types";

export const PAGE_SIZE = 50;

export const DEFAULT_TAB: NotificationsTab = "all";

export const DEFAULT_ACTIVE: boolean | null = true;
export const DEFAULT_SORT_COLUMN: AdminNotificationSortColumn = "last_send";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

export const SORT_COLUMN_VALUES: AdminNotificationSortColumn[] = [
  "id",
  "last_send",
  "last_check",
  "card_name",
  "creator_name",
  "updated_at",
];

export const TAB_FILTERS: Record<NotificationsTab, TabFilters> = {
  all: {},
  // The Failing tab filters on run health (last_check) — the whole-run rollup — so it catches
  // query failures and abandoned runs, not just channel-send delivery failures.
  failing: { last_check_status: "failing" },
  ownerless: { creatorless: true },
};

export const CHANNEL_VALUES: NotificationChannelType[] = [
  "channel/email",
  "channel/slack",
  "channel/http",
];

export const TAB_VALUES: NotificationsTab[] = ["all", "failing", "ownerless"];

export const LAST_SEND_STATUS_VALUES: NotificationRunStatus[] = [
  "failing",
  "successful",
];
