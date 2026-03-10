import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { Groups } from "metabase/entities/groups";
import {
  getGroupSortOrder,
  isAdminGroup,
  isDataAnalystGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type { Group } from "metabase-types/api";

const isPinnedGroup = (group: Group) =>
  isAdminGroup(group) || isDefaultGroup(group) || isDataAnalystGroup(group);

export const getOrderedGroups = createSelector(
  Groups.selectors.getList,
  (groups: Group[]) => {
    const [pinnedGroups, unpinnedGroups] = _.partition(groups, isPinnedGroup);
    const sortedPinnedGroups = _.sortBy(pinnedGroups, getGroupSortOrder);
    return [
      sortedPinnedGroups,
      ..._.partition(unpinnedGroups, PLUGIN_TENANTS.isTenantGroup),
    ];
  },
);

export const getDefaultGroup = createSelector(
  Groups.selectors.getList,
  (groups: Group[]) => groups.find(isDefaultGroup),
);
