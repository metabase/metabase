interface Options {
  groupIds: number[];
  collectionIds: number[];
}

const ALL_USERS_GROUP_ID = 1;

export function getSandboxedCollectionPermissions(options: Options) {
  const { groupIds, collectionIds } = options;

  const groups: Record<string, Record<string, string>> = {};

  groups[ALL_USERS_GROUP_ID] = {};

  // Deny the "all users" group access to any sandboxed collection.
  for (const collectionId of collectionIds) {
    groups[ALL_USERS_GROUP_ID][collectionId] = "none";
  }

  for (let i = 0; i < groupIds.length; i++) {
    const groupId = groupIds[i];

    if (!groups[groupId]) {
      groups[groupId] = {};
    }

    groups[groupId].root = "none";

    // Deny access to other tenant's collections
    for (const collectionId of collectionIds) {
      groups[groupId][collectionId] = "none";
    }

    // Allow access to this tenant's collection
    const collectionId = collectionIds[i];
    groups[groupId][collectionId] = "write";
  }

  return groups;
}
