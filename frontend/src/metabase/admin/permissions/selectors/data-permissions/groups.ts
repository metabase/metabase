import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";
import { assoc } from "icepick";

import Groups from "metabase/entities/groups";
import { Group } from "metabase-types/api";
import {
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";

const isPinnedGroup = (group: Group) =>
  isAdminGroup(group) || isDefaultGroup(group);

export const getOrderedGroups = createSelector(
  Groups.selectors.getList,
  (groups: Group[]) => {
    const translatedGroups = groups.map(group =>
      assoc(group, "name", getGroupNameLocalized(group)),
    );
    return _.partition(translatedGroups, isPinnedGroup);
  },
);

export const getAdminGroup = createSelector(
  Groups.selectors.getList,
  (groups: Group[]) => groups.find(isDefaultGroup),
);
