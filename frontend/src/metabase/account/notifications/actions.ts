import type { NotificationListItem } from "metabase/notifications/types";

const PREFIX = `/account/notifications`;

type ListItemType = NotificationListItem["type"];

const TYPE_MAP: Record<ListItemType, string> = {
  "question-notification": "alert",
  pulse: "pulse",
};

export const getUnsubscribeUrl = (item: { id: number }, type: ListItemType) =>
  `${PREFIX}/${TYPE_MAP[type]}/${item.id}/unsubscribe`;

export const getArchiveUrl = (
  item: { id: number },
  type: ListItemType,
  hasUnsubscribed?: boolean,
) => {
  const query = hasUnsubscribed ? "?unsubscribed=true" : "";
  return `${PREFIX}/${TYPE_MAP[type]}/${item.id}/archive${query}`;
};

export const getHelpUrl = () => `${PREFIX}/help`;
