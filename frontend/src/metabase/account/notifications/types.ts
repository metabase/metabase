import type { DashboardSubscription, Notification } from "metabase-types/api";

export type NotificationType = "alert" | "pulse";

export type DashboardSubscriptionListItem = {
  item: DashboardSubscription;
  type: "pulse";
};

export type QuestionNotificationListItem = {
  item: Notification;
  type: "question-notification";
};

export type NotificationListItem =
  | DashboardSubscriptionListItem
  | QuestionNotificationListItem;
