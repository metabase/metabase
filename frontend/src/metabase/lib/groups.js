import { t } from "ttag";

import { color } from "metabase/lib/colors";

const SPECIAL_GROUP_NAMES = new Map([
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  ["All Users", t`All Users`],
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  ["Administrators", t`Administrators`],
]);

export function isDefaultGroup(group) {
  return group.name === "All Users";
}

export function isAdminGroup(group) {
  return group.name === "Administrators";
}

export function canEditPermissions(group) {
  return !isAdminGroup(group);
}

export function canEditMembership(group) {
  return !isDefaultGroup(group);
}

export function getGroupColor(group) {
  if (isAdminGroup(group)) {
    return color("filter");
  } else if (isDefaultGroup(group)) {
    return color("text-medium");
  } else {
    return color("brand");
  }
}

export function getGroupNameLocalized(group) {
  if (SPECIAL_GROUP_NAMES.has(group.name)) {
    return SPECIAL_GROUP_NAMES.get(group.name);
  } else {
    return group.name;
  }
}
