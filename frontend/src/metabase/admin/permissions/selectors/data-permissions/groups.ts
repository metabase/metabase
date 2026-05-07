import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { permissionApi } from "metabase/api";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import {
  getGroupSortOrder,
  isAdminGroup,
  isDataAnalystGroup,
  isDefaultGroup,
} from "metabase/utils/groups";
import type { Group, GroupId } from "metabase-types/api";

const isPinnedGroup = (group: Group) =>
  isAdminGroup(group) || isDefaultGroup(group) || isDataAnalystGroup(group);

const EMPTY_GROUP_LIST: Group[] = [];

// The list endpoint returns groups without `members`, but the legacy entity
// typed them as `Group[]`. Downstream code never reads `members` from list
// results, so we cast to preserve the existing call signatures.
export const selectGroupList = (state: State): Group[] =>
  (permissionApi.endpoints.listPermissionsGroups.select({})(state).data ??
    EMPTY_GROUP_LIST) as Group[];

export const selectGroupById = (state: State, id: GroupId): Group | undefined =>
  permissionApi.endpoints.getPermissionsGroup.select(id)(state).data ??
  selectGroupList(state).find((group) => group.id === id);

export const getOrderedGroups = createSelector(
  selectGroupList,
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
  selectGroupList,
  (groups: Group[]) => groups.find(isDefaultGroup),
);
