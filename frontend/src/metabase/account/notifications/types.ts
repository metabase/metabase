import type { DashboardSubscription, Notification } from "metabase-types/api";

export type DashboardAlertListItem = {
  item: DashboardSubscription;
  type: "pulse";
};

export type QuestionNotificationListItem = {
  item: Notification;
  type: "question-notification";
};

export type NotificationListItem =
  | DashboardAlertListItem
  | QuestionNotificationListItem;
