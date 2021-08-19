import { push } from "react-router-redux";
import { isSubscribed } from "./selectors";

export const navigateToEdit = (item, type, user) => {
  if (isSubscribed(item, user)) {
    return navigateToUnsubscribe(item, type);
  } else {
    return navigateToArchive(item, type);
  }
};

export const navigateToUnsubscribe = (item, type) => {
  return push(`/account/notifications/${type}/${item.id}/unsubscribe`);
};

export const navigateToArchive = (item, type) => {
  return push(`/account/notifications/${type}/${item.id}/archive`);
};

export const navigateToHelp = () => {
  return push("/account/notifications/help");
};
