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
  modifiedGroupIds: string[],
) {
  if (!originalDataPermissions) {
    return newDataPermissions;
  }

  const modifiedGroupIdsSet = new Set(modifiedGroupIds);

  const allGroupIds = _.uniq([
    ...Object.keys(originalDataPermissions),
    ...Object.keys(newDataPermissions),
  ]);

  const latestPermissionsEntries = allGroupIds.map(groupId => {
    // values can be omitted from the graph to save space or to indicate that the group has default permissions for all entities
    // this means we need to determine the value if we need to use the value currently in memory or default to an empty object
    // which is the FE definition of completely default permissions for all entities
    const defaultValue = modifiedGroupIdsSet.has(groupId)
      ? {}
      : originalDataPermissions[groupId];
    const permissions = newDataPermissions[groupId] ?? defaultValue;
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
