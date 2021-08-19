import { push } from "react-router-redux";

export const navigateToEdit = (item, type) => {
  return push(`/account/notifications/${type}/${item.id}/archive`);
};

export const navigateToHelp = () => {
  return push("/account/notifications/help");
};
