import { useCallback, useMemo } from "react";

import { Api, databaseApi, useListPermissionsGroupsQuery } from "metabase/api";
import { tableApi } from "metabase/api/table";
import { listTag } from "metabase/api/tags";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { PermissionsApi } from "metabase/services";
import type { DatabaseId, TableId } from "metabase-types/api";

import {
  type AllSchemaTables,
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

      // Fetch all tables for each database with sandboxed tables so we can
      // block non-selected tables and schemas
      const uniqueDbIds = [
        ...new Set(sandboxedTables.map((t) => t.databaseId)),
      ];
      const allSchemaTables: AllSchemaTables = {};
      await Promise.all(
        uniqueDbIds.map(async (dbId) => {
          const { data: tables } = await dispatch(
            tableApi.endpoints.listTables.initiate({ dbId }),
          );
          if (tables) {
            const bySchema: Record<string, TableId[]> = {};
            for (const table of tables) {
              const schema = table.schema ?? "";
              if (!bySchema[schema]) {
                bySchema[schema] = [];
              }
              bySchema[schema].push(table.id);
            }
            allSchemaTables[dbId] = bySchema;
          }
        }),
      );

      // Fetch all database IDs so we can block databases without sandboxed tables
      const allDatabaseIds = await dispatch(
        databaseApi.endpoints.listDatabases.initiate(),
      )
        .unwrap()
        .then((res) => res.data.map((db) => db.id))
        .catch(() => [] as DatabaseId[]);

      // get the revision number of the graph
      const graph = await PermissionsApi.graphForGroup({
        groupId: allTenantUsersGroupId,
      });

      const groups = buildPermissionsGraph(
        allTenantUsersGroupId,
        options,
        allSchemaTables,
        allDatabaseIds,
      );
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
