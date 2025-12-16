import { useCallback, useMemo, useState } from "react";

import { skipToken } from "metabase/api";
import {
  useGetDataPermissionsGraphForGroupQuery,
  useGetDataPermissionsGraphQuery,
  useUpdateDataPermissionsGraphMutation,
} from "metabase/api/data-permissions";
import { useListPermissionsGroupsQuery } from "metabase/api/permission";
import { PLUGIN_DATA_PERMISSIONS } from "metabase/plugins";
import type { GroupId, GroupsPermissions } from "metabase-types/api";

import type { DataPermissionValue, EntityId, PermissionSectionConfig } from "../types";
import { DataPermission, DataPermissionType } from "../types";
import type { DatabasePermissionInfo } from "../utils/database-metadata";
import {
  inferAndUpdateEntityPermissions,
  restrictCreateQueriesPermissionsIfNeeded,
  updateFieldsPermission,
  updatePermission,
  updateSchemasPermission,
  updateTablesPermission,
} from "../utils/graph";
import {
  getModifiedGroupsPermissionsGraphParts,
  mergeGroupsPermissionsUpdates,
} from "../utils/graph/partial-updates";

function mergePermissions(
  base: GroupsPermissions | undefined,
  edits: GroupsPermissions,
): GroupsPermissions {
  if (!base) {
    return edits;
  }

  const result: GroupsPermissions = {};

  // Copy all from base
  for (const groupId of Object.keys(base)) {
    result[groupId] = { ...base[groupId] };
  }

  // Apply edits on top (deep merge at database level)
  for (const groupId of Object.keys(edits)) {
    if (!result[groupId]) {
      result[groupId] = {};
    }
    result[groupId] = { ...result[groupId], ...edits[groupId] };
  }

  return result;
}

type UseDataPermissionsStateOptions = {
  groupId?: GroupId;
};

export function useDataPermissionsState(
  options: UseDataPermissionsStateOptions = {},
) {
  const { groupId } = options;

  // Fetch full permissions graph (or for a specific group)
  const {
    data: permissionsGraph,
    isLoading: isLoadingPermissions,
    error: permissionsError,
    refetch: refetchPermissions,
  } = useGetDataPermissionsGraphQuery();

  // Fetch group-specific permissions if groupId provided
  const {
    data: groupPermissionsGraph,
    isLoading: isLoadingGroupPermissions,
  } = useGetDataPermissionsGraphForGroupQuery(
    groupId ? { groupId } : skipToken,
  );

  // Fetch groups
  const { data: groups, isLoading: isLoadingGroups } =
    useListPermissionsGroupsQuery({});

  // Local edits state - tracks changes before save
  const [localEdits, setLocalEdits] = useState<GroupsPermissions>({});

  // Mutation for saving
  const [updateGraph, { isLoading: isSaving, error: saveError }] =
    useUpdateDataPermissionsGraphMutation();

  // Merge server data with group-specific data and local edits
  const permissions = useMemo(() => {
    let basePermissions = permissionsGraph?.groups;

    // Merge in group-specific permissions if available
    if (groupPermissionsGraph?.groups && basePermissions) {
      basePermissions = mergeGroupsPermissionsUpdates(
        basePermissions,
        groupPermissionsGraph.groups,
        Object.keys(groupPermissionsGraph.groups),
      );
    }

    return mergePermissions(basePermissions, localEdits);
  }, [permissionsGraph?.groups, groupPermissionsGraph?.groups, localEdits]);

  // Check if dirty (has unsaved changes)
  const isDirty = useMemo(() => {
    return Object.keys(localEdits).length > 0;
  }, [localEdits]);

  // Update permissions in local state (raw update)
  const updatePermissions = useCallback(
    (updatedPermissions: GroupsPermissions) => {
      setLocalEdits((prev) => mergePermissions(prev, updatedPermissions));
    },
    [],
  );

  /**
   * Update a data permission with full business logic.
   * This applies all the cascading effects, restrictions, and inferences
   * that the Redux thunk + reducer used to handle.
   *
   * Returns an action to execute if a post-action is triggered (e.g., navigation).
   */
  const updateDataPermission = useCallback(
    ({
      groupId: targetGroupId,
      permission: permissionInfo,
      value,
      entityId,
      database,
    }: {
      groupId: number;
      permission: PermissionSectionConfig;
      value: DataPermissionValue;
      entityId: EntityId;
      database: DatabasePermissionInfo;
    }): (() => void) | null => {
      // Handle post-actions (e.g., controlled → navigate to granular)
      if (permissionInfo.postActions) {
        const postAction = permissionInfo.postActions[value];
        if (postAction) {
          // Return the action to be executed by the caller
          return () => postAction(entityId, targetGroupId);
        }
      }

      setLocalEdits((prevEdits) => {
        let currentPermissions = mergePermissions(
          permissionsGraph?.groups,
          prevEdits,
        );

        // Handle DETAILS permission type
        if (permissionInfo.type === DataPermissionType.DETAILS) {
          return updatePermission(
            currentPermissions,
            targetGroupId,
            entityId.databaseId,
            DataPermission.DETAILS,
            [],
            value,
          );
        }

        // Handle NATIVE permission - may need to upgrade view permissions
        if (
          permissionInfo.type === DataPermissionType.NATIVE &&
          PLUGIN_DATA_PERMISSIONS.upgradeViewPermissionsIfNeeded
        ) {
          currentPermissions =
            PLUGIN_DATA_PERMISSIONS.upgradeViewPermissionsIfNeeded(
              currentPermissions,
              targetGroupId,
              entityId,
              value,
              database,
              permissionInfo.permission,
            );
        }

        // Restrict create queries permissions if needed
        currentPermissions = restrictCreateQueriesPermissionsIfNeeded(
          currentPermissions,
          targetGroupId,
          entityId,
          permissionInfo.permission,
          value,
          database,
        );

        // Apply the update at the appropriate level
        if (entityId.tableId != null) {
          currentPermissions = updateFieldsPermission(
            currentPermissions,
            targetGroupId,
            entityId as any,
            value,
            database,
            permissionInfo.permission,
          );
          // Infer and update parent permissions
          currentPermissions = inferAndUpdateEntityPermissions(
            currentPermissions,
            targetGroupId,
            entityId,
            database,
            permissionInfo.permission,
          );
        } else if (entityId.schemaName != null) {
          currentPermissions = updateTablesPermission(
            currentPermissions,
            targetGroupId,
            entityId as any,
            value,
            database,
            permissionInfo.permission,
          );
        } else {
          currentPermissions = updateSchemasPermission(
            currentPermissions,
            targetGroupId,
            entityId as any,
            value,
            database,
            permissionInfo.permission,
          );
        }

        return currentPermissions;
      });

      return null;
    },
    [permissionsGraph?.groups],
  );

  // Save permissions to server
  const savePermissions = useCallback(async () => {
    if (!permissionsGraph || !isDirty) {
      return;
    }

    const allGroupIds = Object.keys(permissions);

    // Get externally modified group IDs from plugins
    const advancedPermissions =
      PLUGIN_DATA_PERMISSIONS.permissionsPayloadExtraSelectors.reduce(
        (data, _selector) => {
          // Note: Plugin selectors need Redux state, so we skip them here
          // They will need to be handled separately if needed
          return data;
        },
        { modifiedGroupIds: [] as string[], permissions: {} },
      );

    // Only send groups that have been modified
    const modifiedGroups = getModifiedGroupsPermissionsGraphParts(
      permissions,
      permissionsGraph.groups,
      allGroupIds,
      advancedPermissions.modifiedGroupIds,
    );

    await updateGraph({
      revision: permissionsGraph.revision,
      groups: modifiedGroups,
    }).unwrap();

    // Refetch and clear local edits
    await refetchPermissions();
    setLocalEdits({});
  }, [permissionsGraph, permissions, isDirty, updateGraph, refetchPermissions]);

  // Discard local changes
  const discardChanges = useCallback(() => {
    setLocalEdits({});
  }, []);

  return {
    permissions,
    originalPermissions: permissionsGraph?.groups ?? {},
    revision: permissionsGraph?.revision,
    groups: groups ?? [],
    isLoading: isLoadingPermissions || isLoadingGroups || isLoadingGroupPermissions,
    error: permissionsError,
    saveError,
    isDirty,
    isSaving,
    updatePermissions,
    updateDataPermission,
    savePermissions,
    discardChanges,
    refetch: refetchPermissions,
  };
}
