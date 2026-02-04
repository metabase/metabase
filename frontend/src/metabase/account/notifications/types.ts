import type { Alert, Notification } from "metabase-types/api";

export type NotificationType = "alert" | "pulse";

export type FormError = {
  status: number;
  data?: {
    message?: string;
  };
};

export type DashboardAlertListItem = {
  item: Alert;
  type: "pulse";
};

export type QuestionNotificationListItem = {
  item: Notification;
  type: "question-notification";
};

export type NotificationListItem =
  | DashboardAlertListItem
  | QuestionNotificationListItem;
