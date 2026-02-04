import { push } from "react-router-redux";

import type { NotificationListItem } from "./types";

const PREFIX = `/account/notifications`;

type ListItemType = NotificationListItem["type"];

const TYPE_MAP: Record<ListItemType, string> = {
  "question-notification": "alert",
  pulse: "pulse",
};

export const navigateToUnsubscribe = (
  item: { id: number },
  type: ListItemType,
) => {
  return push(`${PREFIX}/${TYPE_MAP[type]}/${item.id}/unsubscribe`);
};

export const navigateToArchive = (
  item: { id: number },
  type: ListItemType | string,
  hasUnsubscribed?: boolean,
) => {
  const query = hasUnsubscribed ? "?unsubscribed=true" : "";
  return push(
    `${PREFIX}/${TYPE_MAP[type as ListItemType]}/${item.id}/archive${query}`,
  );
};

export const navigateToHelp = () => {
  return push(`${PREFIX}/help`);
};
