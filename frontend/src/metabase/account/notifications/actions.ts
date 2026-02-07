import { push } from "react-router-redux";

import type { Alert, Notification } from "metabase-types/api";

const PREFIX = `/account/notifications`;

const TYPE_MAP = {
  "question-notification": "alert",
  pulse: "pulse",
} as const;

type NotificationType = "question-notification" | "pulse";

export const navigateToUnsubscribe = (
  item: Alert | Notification,
  type: NotificationType,
) => {
  return push(`${PREFIX}/${TYPE_MAP[type]}/${item.id}/unsubscribe`);
};

export const navigateToArchive = (
  item: Alert | Notification,
  type: NotificationType,
  hasUnsubscribed?: boolean,
) => {
  const query = hasUnsubscribed ? "?unsubscribed=true" : "";
  return push(`${PREFIX}/${TYPE_MAP[type]}/${item.id}/archive${query}`);
};

export const navigateToHelp = () => {
  return push(`${PREFIX}/help`);
};
