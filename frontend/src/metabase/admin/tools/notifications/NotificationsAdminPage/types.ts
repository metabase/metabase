import type {
  AdminNotificationSortColumn,
  NotificationChannelType,
  NotificationId,
  NotificationRunStatus,
  SortDirection,
} from "metabase-types/api";

export type RouteParams = {
  notificationId?: string;
};

export type ChangeOwnerTarget = {
  ids: NotificationId[];
  isBulk: boolean;
};

export type NotificationsTab = "all" | "failing" | "ownerless";

export type NotificationsUrlState = {
  page: number;
  active: boolean | null;
  query: string;
  channel: NotificationChannelType | null;
  last_sent_status: NotificationRunStatus | null;
  owner_active: boolean | null;
  recipient_email: string;
  tab: NotificationsTab;
  sort_column: AdminNotificationSortColumn;
  sort_direction: SortDirection;
};

export type TabFilters = {
  last_sent_status: NotificationRunStatus | null;
  owner_active: boolean | null;
};

export type FilterDraft = {
  channel: NotificationChannelType | null;
  owner_active: boolean | null;
  last_sent_status: NotificationRunStatus | null;
  recipient_email: string;
};
