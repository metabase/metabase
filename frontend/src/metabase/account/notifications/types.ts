import type {
  Alert,
  AlertNotification,
  TableNotification,
} from "metabase-types/api";

export type DashboardAlertListItem = {
  item: Alert;
  type: "pulse";
};

export type QuestionNotificationListItem = {
  item: AlertNotification;
  type: "question-notification";
};

export type TableNotificationListItem = {
  item: TableNotification;
  type: "table-notification";
};

export type NotificationListItem =
  | DashboardAlertListItem
  | QuestionNotificationListItem
  | TableNotificationListItem;
