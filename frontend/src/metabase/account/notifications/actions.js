import { push } from "react-router-redux";

const PREFIX = `/account/notifications`;

const TYPE_MAP = {
  "question-notification": "alert",
  pulse: "pulse",
};

export const navigateToUnsubscribe = (item, type) => {
  return push(`${PREFIX}/${TYPE_MAP[type]}/${item.id}/unsubscribe`);
};

export const navigateToArchive = (item, type, hasUnsubscribed) => {
  const query = hasUnsubscribed ? "?unsubscribed=true" : "";
  return push(`${PREFIX}/${TYPE_MAP[type]}/${item.id}/archive${query}`);
};

export const navigateToHelp = () => {
  return push(`${PREFIX}/help`);
};
