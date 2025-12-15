import { assocIn } from "icepick";
import { useCallback, useMemo, useState } from "react";

import {
  useGetCollectionPermissionsGraphQuery,
  useUpdateCollectionPermissionsGraphMutation,
} from "metabase/api/collection-permissions";
import { useListPermissionsGroupsQuery } from "metabase/api/permission";
import type {
  Collection,
  CollectionId,
  CollectionPermissions,
  GroupId,
} from "metabase-types/api";

import type { CollectionPermissionsConfig } from "../pages/CollectionPermissionsPage/types";
import { getModifiedCollectionPermissionsGraphParts } from "../utils/graph/partial-updates";

type UpdatePermissionParams = {
  groupId: GroupId;
  collectionId: CollectionId;
  value: string;
  shouldPropagate?: boolean;
  collection?: Collection;
};

function getDescendantCollections(
  collection: Collection,
): { id: CollectionId }[] {
  const children = (collection.children ?? []).filter((c) => !c.is_personal);
  return children.flatMap((child) => [
    { id: child.id },
    ...getDescendantCollections(child),
  ]);
}

function mergePermissions(
  base: CollectionPermissions,
  edits: CollectionPermissions,
): CollectionPermissions {
  const result: CollectionPermissions = {};

  // Copy all from base
  for (const groupId of Object.keys(base)) {
    result[groupId] = { ...base[groupId] };
  }

  // Apply edits on top
  for (const groupId of Object.keys(edits)) {
    result[groupId] = { ...result[groupId], ...edits[groupId] };
  }

  return result;
}

export function useCollectionPermissionsState(
  config: CollectionPermissionsConfig,
) {
  const namespace = config.collectionsQuery.namespace;

  // Fetch permissions graph
  const {
    data: permissionsGraph,
    isLoading: isLoadingPermissions,
    error: permissionsError,
    refetch: refetchPermissions,
  } = useGetCollectionPermissionsGraphQuery({ namespace });

  // Fetch groups
  const { data: groups, isLoading: isLoadingGroups } =
    useListPermissionsGroupsQuery({});

  // Local edits state - tracks changes before save
  const [localEdits, setLocalEdits] = useState<CollectionPermissions>({});

  // Mutation for saving
  const [updateGraph, { isLoading: isSaving }] =
    useUpdateCollectionPermissionsGraphMutation();

  // Merge server data with local edits
  const permissions = useMemo(() => {
    if (!permissionsGraph?.groups) {
      return {};
    }
    return mergePermissions(permissionsGraph.groups, localEdits);
  }, [permissionsGraph?.groups, localEdits]);

  // Check if dirty (has unsaved changes)
  const isDirty = useMemo(() => {
    return Object.keys(localEdits).length > 0;
  }, [localEdits]);

  // Update a single permission (and optionally propagate to children)
  const updatePermission = useCallback(
    ({
      groupId,
      collectionId,
      value,
      shouldPropagate,
      collection,
    }: UpdatePermissionParams) => {
      setLocalEdits((prev) => {
        let next = assocIn(prev, [groupId, collectionId], value);

        // Propagate to children if requested
        if (shouldPropagate && collection) {
          const descendants = getDescendantCollections(collection);
          for (const child of descendants) {
            next = assocIn(next, [groupId, child.id], value);
          }
        }

        return next;
      });
    },
    [],
  );

  // Save permissions to server
  const savePermissions = useCallback(async () => {
    if (!permissionsGraph || !isDirty) {
      return;
    }

    // Only send groups that have been modified
    const modifiedGroups = getModifiedCollectionPermissionsGraphParts(
      permissionsGraph.groups,
      permissions,
    );

    await updateGraph({
      namespace,
      revision: permissionsGraph.revision,
      groups: modifiedGroups,
    }).unwrap();

    // The mutation invalidates the cache, which triggers a refetch.
    // Clear local edits after refetch completes to show updated server state.
    await refetchPermissions();
    setLocalEdits({});
  }, [
    permissionsGraph,
    permissions,
    namespace,
    isDirty,
    updateGraph,
    refetchPermissions,
  ]);

  // Discard local changes
  const discardChanges = useCallback(() => {
    setLocalEdits({});
  }, []);

  return {
    permissions,
    originalPermissions: permissionsGraph?.groups ?? {},
    groups: groups ?? [],
    isLoading: isLoadingPermissions || isLoadingGroups,
    error: permissionsError,
    isDirty,
    isSaving,
    updatePermission,
    savePermissions,
    discardChanges,
    refetch: refetchPermissions,
  };
}
