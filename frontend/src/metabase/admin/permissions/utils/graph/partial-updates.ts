import _ from "underscore";

import type {
  CollectionPermissions,
  GroupsPermissions,
} from "metabase-types/api";

// utils for dealing with partial graph updates

// select only the parts of the permission graph that contain some kind of edit
// currently only selects values based on some kind of modification happening anywhere
// in the graph for a particular group
export function getModifiedGroupsPermissionsGraphParts(
  dataPermissions: GroupsPermissions,
  originalDataPermissions: GroupsPermissions,
  allGroupIds: string[],
  externallyModifiedGroupIds: string[],
) {
  const dataPermissionsModifiedGroupIds = allGroupIds.filter(groupId => {
    return !_.isEqual(
      dataPermissions[groupId],
      originalDataPermissions[groupId],
    );
  });

  const allModifiedGroupIds = _.uniq([
    ...dataPermissionsModifiedGroupIds,
    ...externallyModifiedGroupIds,
  ]);

  return _.pick(dataPermissions, allModifiedGroupIds);
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
      newDataPermissions[groupId] ?? originalDataPermissions[groupId];
    return [groupId, permissions];
  });

  return Object.fromEntries(latestPermissionsEntries);
}

export function getModifiedCollectionPermissionsGraphParts(
  originalCollectionPermissions: CollectionPermissions,
  collectionPermissions: CollectionPermissions,
) {
  const groupIds = Object.keys(collectionPermissions);
  const modifiedGroupIds = groupIds.filter(groupId => {
    const originalPerms = originalCollectionPermissions[groupId];
    const currPerms = collectionPermissions[groupId];
    return !_.isEqual(currPerms, originalPerms);
  });
  return _.pick(collectionPermissions, modifiedGroupIds);
}
