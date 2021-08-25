import { push } from "react-router-redux";

const PREFIX = `/account/notifications`;

export const navigateToUnsubscribe = (item, type) => {
  return push(`${PREFIX}/${type}/${item.id}/unsubscribe`);
};

export const navigateToArchive = (item, type, hasUnsubscribed) => {
  const query = hasUnsubscribed ? "?unsubscribed=true" : "";
  return push(`${PREFIX}/${type}/${item.id}/archive${query}`);
};

export const navigateToHelp = () => {
  return push(`${PREFIX}/help`);
};
