import { assocIn, dissocIn } from "icepick";

import type {
  Collection,
  CollectionPermissions,
  GroupId,
} from "metabase-types/api";

import { getDescendantCollections } from "../../utils/collection-editor";

type UpdateCollectionPermissionParams = {
  groupId: GroupId;
  collection: Collection;
  value: unknown;
  shouldPropagateToChildren: boolean | null;
};

const restoreCollectionPermission = (
  permissions: CollectionPermissions,
  originalPermissions: CollectionPermissions,
  groupId: GroupId,
  collection: Collection,
) => {
  const originalValue = originalPermissions[groupId]?.[collection.id];
  return originalValue != null
    ? assocIn(permissions, [groupId, collection.id], originalValue)
    : dissocIn(permissions, [groupId, collection.id]);
};

export function updateCollectionPermissions(
  permissions: CollectionPermissions,
  originalPermissions: CollectionPermissions,
  {
    groupId,
    collection,
    value,
    shouldPropagateToChildren,
  }: UpdateCollectionPermissionParams,
): CollectionPermissions {
  const updatedPermissions = assocIn(
    permissions,
    [groupId, collection.id],
    value,
  );
  if (shouldPropagateToChildren == null) {
    return updatedPermissions;
  }

  return getDescendantCollections(collection).reduce(
    (result, descendant) =>
      shouldPropagateToChildren
        ? assocIn(result, [groupId, descendant.id], value)
        : restoreCollectionPermission(
            result,
            originalPermissions,
            groupId,
            descendant,
          ),
    updatedPermissions,
  );
}
