import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type { GroupInfo } from "metabase-types/api";

const SPECIAL_GROUP_NAMES = new Map([
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  ["All Users", t`All Users`],
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  ["Administrators", t`Administrators`],
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  ["All tenant users", t`All tenant users`],
]);

export function isDefaultGroup(group: Pick<GroupInfo, "magic_group_type">) {
  return group.magic_group_type === "all-internal-users";
}

export function isAdminGroup(group: Pick<GroupInfo, "magic_group_type">) {
  return group.magic_group_type === "admin";
}

export function canEditPermissions(group: Pick<GroupInfo, "magic_group_type">) {
  return !isAdminGroup(group);
}

export function canEditMembership(group: Pick<GroupInfo, "magic_group_type">) {
  return !isDefaultGroup(group) && !PLUGIN_TENANTS.isExternalUsersGroup(group);
}

export function getGroupColor(group: Pick<GroupInfo, "magic_group_type">) {
  if (isAdminGroup(group)) {
    return color("filter");
  } else if (isDefaultGroup(group)) {
    return color("text-secondary");
  } else {
    return color("brand");
  }
}

export function getGroupNameLocalized(group: Pick<GroupInfo, "name">) {
  return SPECIAL_GROUP_NAMES.get(group.name) ?? group.name;
}
