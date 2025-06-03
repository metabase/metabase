import { t } from "ttag";

import { color } from "metabase/lib/colors";
import type { Group } from "metabase-types/api";

const SPECIAL_GROUP_NAMES = new Map([
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  ["All Users", t`All Users`],
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  ["Administrators", t`Administrators`],
]);

export function isDefaultGroup(group: Pick<Group, "name">) {
  return group.name === "All Users";
}

export function isAdminGroup(group: Pick<Group, "name">) {
  return group.name === "Administrators";
}

export function canEditPermissions(group: Pick<Group, "name">) {
  return !isAdminGroup(group);
}

export function canEditMembership(group: Pick<Group, "name">) {
  return !isDefaultGroup(group);
}

export function getGroupColor(group: Pick<Group, "name">) {
  if (isAdminGroup(group)) {
    return color("filter");
  } else if (isDefaultGroup(group)) {
    return color("text-medium");
  } else {
    return color("brand");
  }
}

export function getGroupNameLocalized(group: Pick<Group, "name">) {
  return SPECIAL_GROUP_NAMES.get(group.name) ?? group.name;
}
