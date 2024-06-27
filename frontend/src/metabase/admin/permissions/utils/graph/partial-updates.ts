import _ from "underscore";

import type { GroupPermissions } from "metabase-types/api";

// utils for dealing with partial graph updates

// access

export function getModifiedGroupIds(
  groupIds: string[],
  originalDataPermissions: GroupPermissions,
  newDataPermissions: GroupPermissions,
) {
  // find only the groupIds that have had some kind of modification made in their permissions graph
  return groupIds.filter(groupId => {
    return !_.isEqual(
      newDataPermissions[groupId as unknown as number],
      originalDataPermissions[groupId as unknown as number],
    );
  });
}

function getModifiedGroupItems(
  items: { group_id: number }[],
  groupIds: Set<string>,
) {
  return items.filter(item => groupIds.has(`${item.group_id}`));
}

export function getPermissionsUpdatesForGroupIds(
  dataPermissions: GroupPermissions,
  dataPermissionsRevision: number,
  advancedPermissionsData: Record<string, { group_id: number }[]>,
  groupIds: string[],
) {
  const groupIdsSet = new Set(groupIds);

  const filterAdvancedPermissionsData = Object.fromEntries(
    Object.entries(advancedPermissionsData).map(([key, value]) => {
      return [key, getModifiedGroupItems(value, groupIdsSet)];
    }),
  );

  return {
    groups: _.pick(dataPermissions, groupIds),
    revision: dataPermissionsRevision,
    ...filterAdvancedPermissionsData,
  };
}

export function mergeGroupPermissionsUpdates(
  originalDataPermissions: GroupPermissions | null | undefined,
  newDataPermissions: GroupPermissions,
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
