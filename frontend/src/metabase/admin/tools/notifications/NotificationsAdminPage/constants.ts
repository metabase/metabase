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
export const DEFAULT_SORT_COLUMN: AdminNotificationSortColumn = "updated_at";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

export const SORT_COLUMN_VALUES: AdminNotificationSortColumn[] = [
  "last_sent",
  "card_name",
  "owner_name",
  "updated_at",
];

export const TAB_FILTERS: Record<NotificationsTab, TabFilters> = {
  all: { last_sent_status: null, owner_active: null },
  failing: { last_sent_status: "failing", owner_active: null },
  ownerless: { last_sent_status: null, owner_active: false },
};

export const CHANNEL_VALUES: NotificationChannelType[] = [
  "channel/email",
  "channel/slack",
  "channel/http",
];

export const TAB_VALUES: NotificationsTab[] = ["all", "failing", "ownerless"];

export const LAST_SENT_STATUS_VALUES: NotificationRunStatus[] = [
  "failing",
  "successful",
];
