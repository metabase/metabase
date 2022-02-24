import { createSelector } from "reselect";
import { t } from "ttag";
import _ from "underscore";

import Groups from "metabase/entities/groups";

import { State } from "metabase-types/store";
import { Group } from "metabase-types/types/Permissions";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";

type RouteParams = {
  groupId: string;
  databaseId: string;
  schemaName: string;
};

const isPinnedGroup = (group: Group) =>
  isAdminGroup(group) || isDefaultGroup(group);

const getGroupRouteParams = (_state: State, props: { params: RouteParams }) => {
  const { groupId, databaseId, schemaName } = props.params;
  return {
    groupId: groupId != null ? parseInt(groupId) : null,
    databaseId,
    schemaName,
  };
};

export const getGroupsSidebar = createSelector(
  Groups.selectors.getList,
  getGroupRouteParams,
  (groups: Group[], params) => {
    const { groupId } = params;

    const [pinnedGroups, unpinnedGroups] = _.partition(groups, isPinnedGroup);

    const pinnedGroupItems = pinnedGroups.map(group => ({
      ...group,
      icon: "bolt",
    }));

    const unpinnedGroupItems = unpinnedGroups.map(group => ({
      ...group,
      icon: "group",
    }));

    return {
      selectedId: groupId,
      entityGroups: [pinnedGroupItems, unpinnedGroupItems],
      entityViewFocus: "group",
      filterPlaceholder: t`Search for a group`,
    };
  },
);
