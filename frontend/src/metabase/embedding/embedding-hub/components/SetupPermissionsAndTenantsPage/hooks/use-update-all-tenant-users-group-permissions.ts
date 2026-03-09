import { useCallback, useMemo } from "react";

import { Api, useListPermissionsGroupsQuery } from "metabase/api";
import { listTag } from "metabase/api/tags";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { PermissionsApi } from "metabase/services";

import {
  type UpdateTenantDataAccessOptions,
  buildPermissionsGraph,
  buildSandboxPolicies,
} from "../utils/permission-utils";

interface UseUpdateAllTenantUsersGroupPermissionsResult {
  /**
   * Updates data access for the tenant users group in a single API call.
   * Supports both connection impersonation and row-level security (sandboxing).
   */
  updateDataAccess: (options: UpdateTenantDataAccessOptions) => Promise<void>;

  tenantUsersGroupId?: number;

  /** Whether the tenant users group data is still loading */
  isLoading: boolean;

  /** Whether the hook is ready to update permissions */
  isReady: boolean;
}

/**
 * Hook for updating data access for the "All tenant users" group:
 *
 * - Row-level security (table-level)
 * - Connection impersonation (database-level)
 */
export function useUpdateAllTenantUsersGroupPermissions(): UseUpdateAllTenantUsersGroupPermissionsResult {
  const dispatch = useDispatch();

  const { data: permissionGroups, isLoading } = useListPermissionsGroupsQuery(
    {},
  );

  const allTenantUsersGroupId = useMemo(
    () => permissionGroups?.find(PLUGIN_TENANTS.isExternalUsersGroup)?.id,
    [permissionGroups],
  );

  const updateDataAccess = useCallback(
    async (options: UpdateTenantDataAccessOptions) => {
      if (allTenantUsersGroupId === undefined) {
        return;
      }

      const { impersonatedDatabaseIds = [], sandboxedTables = [] } = options;

      // at least one impersonations or sandboxes are needed to setup
      if (
        impersonatedDatabaseIds.length === 0 &&
        sandboxedTables.length === 0
      ) {
        return;
      }

      // get the revision number of the graph
      const graph = await PermissionsApi.graphForGroup({
        groupId: allTenantUsersGroupId,
      });

      const groups = buildPermissionsGraph(allTenantUsersGroupId, options);
      const sandboxes = buildSandboxPolicies(
        allTenantUsersGroupId,
        sandboxedTables,
      );

      const impersonations = impersonatedDatabaseIds.map((databaseId) => ({
        db_id: databaseId,
        group_id: allTenantUsersGroupId,
        attribute: "database_role",
      }));

      await PermissionsApi.updateGraph({
        groups,
        revision: graph?.revision,
        ...(sandboxes.length > 0 && { sandboxes }),
        ...(impersonations.length > 0 && { impersonations }),
      });

      // invalidate the onboarding checklist and group table access policies
      // so subsequent updates can find the newly created sandbox IDs
      dispatch(
        Api.util.invalidateTags([
          listTag("embedding-hub-checklist"),
          listTag("group-table-access-policy"),
        ]),
      );
    },
    [allTenantUsersGroupId, dispatch],
  );

  return {
    updateDataAccess,
    tenantUsersGroupId: allTenantUsersGroupId,
    isLoading,
    isReady: allTenantUsersGroupId !== undefined,
  };
}
