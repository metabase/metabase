import type { NotificationListItem } from "./types";

const PREFIX = `/account/notifications`;

type ListItemType = NotificationListItem["type"];

const TYPE_MAP: Record<ListItemType, string> = {
  "question-notification": "alert",
  pulse: "pulse",
};

export const getUnsubscribePath = (
  item: { id: number },
  type: ListItemType,
) => {
  return `${PREFIX}/${TYPE_MAP[type]}/${item.id}/unsubscribe`;
};

export const getArchivePath = (
  item: { id: number },
  type: ListItemType,
  hasUnsubscribed?: boolean,
) => {
  const query = hasUnsubscribed ? "?unsubscribed=true" : "";
  return `${PREFIX}/${TYPE_MAP[type]}/${item.id}/archive${query}`;
};

export const getHelpPath = () => `${PREFIX}/help`;
