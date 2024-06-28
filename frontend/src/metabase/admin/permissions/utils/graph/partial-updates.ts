import _ from "underscore";

import type { GroupsPermissions } from "metabase-types/api";

type AdvancedPermissions = Record<
  string,
  { group_id: number; [key: string]: unknown }[] | undefined
>;

interface AdvancedPermissionsData {
  modifiedGroupIds: string[];
  permissions: AdvancedPermissions;
}

// utils for dealing with partial graph updates

function getModifiedGroupIdsInGraph(
  groupIds: string[],
  originalDataPermissions: GroupsPermissions,
  newDataPermissions: GroupsPermissions,
) {
  // find only the groupIds that have had some kind of modification made in their permissions graph
  return groupIds.filter(groupId => {
    return !_.isEqual(
      newDataPermissions[groupId as unknown as number],
      originalDataPermissions[groupId as unknown as number],
    );
  });
}

function getModifiedAdvancedPermissions(
  advancedPermissions: AdvancedPermissions,
  modifiedGroupIds: string[],
) {
  const groupIds = new Set(modifiedGroupIds);

  return Object.fromEntries(
    Object.entries(advancedPermissions).map(([key, items]) => {
      const modified = (items || []).filter(item =>
        groupIds.has(`${item.group_id}`),
      );
      return [key, modified];
    }),
  );
}

// select only the parts of the permission graph that contain some kind of edit
// currently only selects values based on some kind of modification happening anywhere
// in the graph for a particular group
export function getModifiedPermissionsGraphParts(
  allGroupIds: string[],
  dataPermissions: GroupsPermissions,
  originalDataPermissions: GroupsPermissions,
  advancedPermissionsData: AdvancedPermissionsData,
  dataPermissionsRevision: number,
) {
  const modifiedGroupIds = _.uniq([
    ...getModifiedGroupIdsInGraph(
      allGroupIds,
      originalDataPermissions,
      dataPermissions,
    ),
    ...advancedPermissionsData.modifiedGroupIds,
  ]);

  return {
    groups: _.pick(dataPermissions, modifiedGroupIds),
    revision: dataPermissionsRevision,
    ...getModifiedAdvancedPermissions(
      advancedPermissionsData.permissions,
      modifiedGroupIds,
    ),
  };
}

export function mergeGroupsPermissionsUpdates(
  originalDataPermissions: GroupsPermissions | null | undefined,
  newDataPermissions: GroupsPermissions,
) {
  if (!originalDataPermissions) {
    return newDataPermissions;
  }

  const allGroupIds = _.uniq([
    ...Object.keys(originalDataPermissions),
    ...Object.keys(newDataPermissions),
  ]);

  const latestPermissionsEntries = allGroupIds.map(groupId => {
    const permissions =
      newDataPermissions[groupId as unknown as number] ??
      originalDataPermissions[groupId as unknown as number];
    return [groupId, permissions];
  });

  return Object.fromEntries(latestPermissionsEntries);
}
