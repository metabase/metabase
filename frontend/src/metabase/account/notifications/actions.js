import { push } from "react-router-redux";

export const navigateToUnsubscribe = (item, type) => {
  return push(`/account/notifications/${type}/${item.id}/unsubscribe`);
};

export const navigateToArchive = (item, type) => {
  return push(`/account/notifications/${type}/${item.id}/archive`);
};

export const navigateToHelp = () => {
  return push("/account/notifications/help");
};
