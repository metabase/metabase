import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import Groups from "metabase/entities/groups";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import type { Group } from "metabase-types/api";

const isPinnedGroup = (group: Group) =>
  isAdminGroup(group) || isDefaultGroup(group);

export const getOrderedGroups = createSelector(
  Groups.selectors.getList,
  (groups: Group[]) => {
    return _.partition(groups, isPinnedGroup);
  },
);

export const getAdminGroup = createSelector(
  Groups.selectors.getList,
  (groups: Group[]) => groups.find(isDefaultGroup),
);
