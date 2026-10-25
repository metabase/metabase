import _ from "underscore";

import {
  getGroupSortOrder,
  isAdminGroup,
  isDataAnalystGroup,
  isDefaultGroup,
} from "metabase/common/utils/groups";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type { GroupInfo } from "metabase-types/api";

const isPinnedGroup = (group: GroupInfo) =>
  isAdminGroup(group) || isDefaultGroup(group) || isDataAnalystGroup(group);

export const getOrderedGroups = (groups: GroupInfo[]): GroupInfo[][] => {
  const [pinnedGroups, unpinnedGroups] = _.partition(groups, isPinnedGroup);
  const sortedPinnedGroups = _.sortBy(pinnedGroups, getGroupSortOrder);
  return [
    sortedPinnedGroups,
    ..._.partition(unpinnedGroups, PLUGIN_TENANTS.isTenantGroup),
  ];
};

export const getDefaultGroup = (groups: GroupInfo[]) =>
  groups.find(isDefaultGroup);
