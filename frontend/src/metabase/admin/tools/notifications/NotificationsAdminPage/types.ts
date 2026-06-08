import type {
  AdminNotificationListParams,
  AdminNotificationSortColumn,
  NotificationChannelType,
  NotificationRunStatus,
  SortDirection,
} from "metabase-types/api";

export type RouteParams = {
  notificationId?: string;
};

export type NotificationsTab = "all" | "failing" | "ownerless";

export type NotificationsUrlState = {
  page: number;
  active: boolean | null;
  query: string;
  channel: NotificationChannelType[];
  last_send_status: NotificationRunStatus | null;
  creator_active: boolean | null;
  recipient_email: string;
  tab: NotificationsTab;
  sort_column: AdminNotificationSortColumn;
  sort_direction: SortDirection;
};

export type TabFilters = Partial<
  Pick<AdminNotificationListParams, "last_check_status" | "creatorless">
>;

export type FilterDraft = {
  channel: NotificationChannelType[];
  creator_active: boolean | null;
  last_send_status: NotificationRunStatus | null;
  recipient_email: string;
};
