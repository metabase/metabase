import { assocIn } from "icepick";

import type {
  Collection,
  CollectionPermissions,
  GroupId,
} from "metabase-types/api";

export type UpdateCollectionPermissionParams = {
  groupId: GroupId;
  collection: Collection;
  value: unknown;
  shouldPropagateToChildren: boolean | null;
};

function getDescendantCollections(collection: Collection): Collection[] {
  const subCollections = (collection.children ?? []).filter(
    (child) => !child.is_personal,
  );
  return subCollections.concat(...subCollections.map(getDescendantCollections));
}

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
      assocIn(
        result,
        [groupId, descendant.id],
        shouldPropagateToChildren
          ? value
          : originalPermissions[groupId]?.[descendant.id],
      ),
    updatedPermissions,
  );
}
