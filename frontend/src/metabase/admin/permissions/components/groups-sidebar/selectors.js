import { createSelector } from "reselect";
import { t } from "ttag";
import _ from "underscore";

import {
  isDefaultGroup,
  isAdminGroup,
  isMetaBotGroup,
} from "metabase/lib/groups";

import Group from "metabase/entities/groups";

const isPinnedGroup = group =>
  isAdminGroup(group) || isDefaultGroup(group) || isMetaBotGroup(group);

export const getGroupsSidebar = createSelector(
  Group.selectors.getList,
  groups => {
    let [pinnedGroups, unpinnedGroups] = _.partition(groups, isPinnedGroup);

    pinnedGroups = pinnedGroups.map(group => ({
      ...group,
      icon: "bolt",
    }));

    unpinnedGroups = unpinnedGroups.map(group => ({
      ...group,
      icon: "group",
    }));

    return {
      entityGroups: [pinnedGroups, unpinnedGroups],
      entitySwitch: {
        value: "groups",
        options: [
          {
            name: t`Groups`,
            value: "groups",
          },
          {
            name: t`Databases`,
            value: "databases",
          },
        ],
      },
      filterPlaceholder: "Search for a group",
    };
  },
);
