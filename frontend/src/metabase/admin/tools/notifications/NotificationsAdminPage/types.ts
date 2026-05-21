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
  channel: NotificationChannelType[];
  last_send_status: NotificationRunStatus | null;
  creatorless: boolean | null;
  recipient_email: string;
  tab: NotificationsTab;
  sort_column: AdminNotificationSortColumn;
  sort_direction: SortDirection;
};

export type TabFilters = Partial<
  Pick<NotificationsUrlState, "last_send_status" | "creatorless">
>;

export type FilterDraft = {
  channel: NotificationChannelType[];
  creatorless: boolean | null;
  last_send_status: NotificationRunStatus | null;
  recipient_email: string;
};
