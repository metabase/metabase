import { t } from "ttag";

const SPECIAL_GROUP_NAMES = new Map([
  ["All Users", t`All Users`],
  ["Administrators", t`Administrators`],
  ["RepenteBot", t`RepenteBot`],
]);

export function isDefaultGroup(group) {
  return group.name === "All Users";
}

export function isAdminGroup(group) {
  return group.name === "Administrators";
}

export function isMetaBotGroup(group) {
  return group.name === "RepenteBot";
}

export function isSpecialGroup(group) {
  return isDefaultGroup(group) || isMetaBotGroup(group);
}

export function canEditPermissions(group) {
  return !isAdminGroup(group);
}

export function canEditMembership(group) {
  return !isDefaultGroup(group) && !isMetaBotGroup(group);
}

export function getGroupColor(group) {
  return isAdminGroup(group)
    ? "text-purple"
    : isDefaultGroup(group)
    ? "text-medium"
    : "text-brand";
}

export function getGroupNameLocalized(group) {
  if (SPECIAL_GROUP_NAMES.has(group.name)) {
    return SPECIAL_GROUP_NAMES.get(group.name);
  } else {
    return group.name;
  }
}
