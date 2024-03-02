import { createSelector } from "@reduxjs/toolkit";
import { t } from "ttag";

import { getGroupNameLocalized } from "metabase/lib/groups";
import type { Group } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { RawGroupRouteParams } from "../../types";

import { getOrderedGroups } from "./groups";

const getGroupRouteParams = (
  _state: State,
  props: { params: RawGroupRouteParams },
) => {
  const { groupId, databaseId, schemaName } = props.params;
  return {
    groupId: groupId != null ? parseInt(groupId) : null,
    databaseId,
    schemaName,
  };
};

export const getGroupsSidebar = createSelector(
  getOrderedGroups,
  getGroupRouteParams,
  (groups: Group[][], params) => {
    const { groupId } = params;

    const [pinnedGroups, unpinnedGroups] = groups;

    const pinnedGroupItems = pinnedGroups.map(group => ({
      ...group,
      name: getGroupNameLocalized(group),
      icon: "bolt",
    }));

    const unpinnedGroupItems = unpinnedGroups.map(group => ({
      ...group,
      name: getGroupNameLocalized(group),
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
