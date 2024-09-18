import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Group } from "metabase-types/api";

const SPECIAL_GROUP_NAMES = new Map([
  ["All Users", t`All Users`],
  ["Administrators", t`Administrators`],
]);

type InputGroup = Pick<Group, "name"> | undefined;
export function isDefaultGroup(group: InputGroup) {
  return group?.name === "All Users";
}

export function isAdminGroup(group: InputGroup) {
  return group?.name === "Administrators";
}

export function canEditPermissions(group: InputGroup) {
  return !isAdminGroup(group);
}

export function canEditMembership(group: InputGroup) {
  return !isDefaultGroup(group);
}

export function getGroupColor(group: InputGroup) {
  if (isAdminGroup(group)) {
    return color("filter");
  } else if (isDefaultGroup(group)) {
    return color("text-medium");
  } else {
    return color("brand");
  }
}

export function getGroupNameLocalized(group: InputGroup) {
  if (SPECIAL_GROUP_NAMES.has(group?.name || "")) {
    return SPECIAL_GROUP_NAMES.get(group?.name ?? "");
  } else {
    return group?.name;
  }
}
