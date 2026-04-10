import { t } from "ttag";

import type { SpecialGroupType } from "metabase/admin/permissions/types";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type { GroupInfo } from "metabase-types/api";

const SPECIAL_GROUP_NAMES: Record<string, () => string> = {
  "All Users": () => t`All Users`,
  Administrators: () => t`Administrators`,
  "All tenant users": () => t`All tenant users`,
  "Data Analysts": () => t`Data Analysts`,
};

export function isDefaultGroup(group: Pick<GroupInfo, "magic_group_type">) {
  return group.magic_group_type === "all-internal-users";
}

export function isAdminGroup(group: Pick<GroupInfo, "magic_group_type">) {
  return group.magic_group_type === "admin";
}

export function isDataAnalystGroup(group: Pick<GroupInfo, "magic_group_type">) {
  return group.magic_group_type === "data-analyst";
}

export function getSpecialGroupType(
  group: Pick<GroupInfo, "magic_group_type">,
  isExternal: boolean = false,
): SpecialGroupType {
  if (isAdminGroup(group)) {
    return "admin";
  }
  if (isDataAnalystGroup(group)) {
    return "analyst";
  }
  if (isExternal) {
    return "external";
  }
  return null;
}

export function canEditMembership(group: Pick<GroupInfo, "magic_group_type">) {
  return !isDefaultGroup(group) && !PLUGIN_TENANTS.isExternalUsersGroup(group);
}

export function getGroupNameLocalized(group: Pick<GroupInfo, "name">) {
  const specialName = SPECIAL_GROUP_NAMES[group.name];
  return specialName ? specialName() : group.name;
}

export function getGroupSortOrder(group: Pick<GroupInfo, "magic_group_type">) {
  if (isAdminGroup(group)) {
    return 0;
  }
  if (isDefaultGroup(group)) {
    return 1;
  }
  if (isDataAnalystGroup(group)) {
    return 2;
  }
  return 3;
}
