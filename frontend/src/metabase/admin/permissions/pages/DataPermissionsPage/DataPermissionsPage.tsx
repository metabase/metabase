import type { ReactNode } from "react";
import { useMemo } from "react";
import type { Route } from "react-router";

import { useListDatabasesQuery } from "metabase/api";
import { useListPermissionsGroupsQuery } from "metabase/api/permission";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Center, Loader } from "metabase/ui";
import type {
  ConcreteTableId,
  Database,
  GroupInfo,
  GroupsPermissions,
  PermissionsGraph,
} from "metabase-types/api";

import { DataPermissionsHelp } from "../../components/DataPermissionsHelp";
import { PermissionsPageLayout } from "../../components/PermissionsPageLayout/PermissionsPageLayout";
import { useDataPermissionsState } from "../../hooks";
import { DataPermission, type DataPermissionValue } from "../../types";
import {
  getFieldsPermission,
  getSchemasPermission,
  isRestrictivePermission,
} from "../../utils/graph";

type DataPermissionsPageProps = {
  children: ReactNode;
  route: typeof Route;
};

/**
 * Simplified diff computation for the save confirmation modal.
 * Shows group/database level changes in native query permissions and table access.
 */
function computePermissionsDiff(
  newPerms: GroupsPermissions,
  oldPerms: GroupsPermissions,
  groups: GroupInfo[],
  databases: Database[],
) {
  const diff: { groups: Record<string, any> } = { groups: {} };

  if (!newPerms || !oldPerms) {
    return diff;
  }

  for (const group of groups) {
    const groupDiff: { name: string; databases: Record<string, any> } = {
      name: group.name,
      databases: {},
    };

    for (const database of databases) {
      const databaseDiff: {
        name: string;
        grantedTables?: Record<number, { name: string }>;
        revokedTables?: Record<number, { name: string }>;
        native?: DataPermissionValue;
      } = {
        name: database.name,
      };

      // Check native permission changes
      const oldNativePerm = getSchemasPermission(
        oldPerms,
        group.id,
        { databaseId: database.id },
        DataPermission.CREATE_QUERIES,
      );
      const newNativePerm = getSchemasPermission(
        newPerms,
        group.id,
        { databaseId: database.id },
        DataPermission.CREATE_QUERIES,
      );
      if (oldNativePerm !== newNativePerm) {
        databaseDiff.native = newNativePerm;
      }

      // Check table permission changes (if tables are available)
      // Note: useListDatabasesQuery doesn't return tables, so this is for future use
      if (database.tables) {
        const grantedTables: Record<string | number, { name: string }> = {};
        const revokedTables: Record<string | number, { name: string }> = {};

        for (const table of database.tables) {
          // Skip virtual/string table IDs
          if (typeof table.id !== "number") {
            continue;
          }
          const oldFieldsPerm = getFieldsPermission(
            oldPerms,
            group.id,
            {
              databaseId: database.id,
              schemaName: table.schema ?? "",
              tableId: table.id as ConcreteTableId,
            },
            DataPermission.VIEW_DATA,
          );
          const newFieldsPerm = getFieldsPermission(
            newPerms,
            group.id,
            {
              databaseId: database.id,
              schemaName: table.schema ?? "",
              tableId: table.id as ConcreteTableId,
            },
            DataPermission.VIEW_DATA,
          );
          if (oldFieldsPerm !== newFieldsPerm) {
            if (isRestrictivePermission(newFieldsPerm)) {
              revokedTables[table.id] = { name: table.display_name };
            } else {
              grantedTables[table.id] = { name: table.display_name };
            }
          }
        }

        if (Object.keys(grantedTables).length > 0) {
          databaseDiff.grantedTables = grantedTables;
        }
        if (Object.keys(revokedTables).length > 0) {
          databaseDiff.revokedTables = revokedTables;
        }
      }

      // Only add database to diff if there are changes
      if (
        databaseDiff.native != null ||
        databaseDiff.grantedTables != null ||
        databaseDiff.revokedTables != null
      ) {
        groupDiff.databases[database.id] = databaseDiff;
      }
    }

    // Only add group to diff if there are database changes
    if (Object.keys(groupDiff.databases).length > 0) {
      diff.groups[group.id] = groupDiff;
    }
  }

  return diff;
}

export function DataPermissionsPage({
  children,
  route,
}: DataPermissionsPageProps) {
  // Fetch databases
  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
  } = useListDatabasesQuery({ include_only_uploadable: false });

  // Fetch groups
  const {
    data: groups,
    isLoading: isLoadingGroups,
  } = useListPermissionsGroupsQuery({});

  // Get permissions state
  const {
    permissions,
    originalPermissions,
    isDirty,
    savePermissions,
    discardChanges,
    isLoading: isLoadingPermissions,
  } = useDataPermissionsState({});

  const showSplitPermsModal = useSelector((state) =>
    getSetting(state, "show-updated-permission-modal"),
  );

  const isLoading = isLoadingDatabases || isLoadingGroups || isLoadingPermissions;

  // Compute diff for save confirmation
  // Cast to PermissionsGraph - the diff structure is compatible, PermissionsConfirm only uses .groups
  const diff = useMemo((): PermissionsGraph | undefined => {
    if (!permissions || !originalPermissions || !groups || !databasesResponse?.data) {
      return undefined;
    }
    // Note: useListDatabasesQuery doesn't include tables, so table-level diff won't show
    // We'd need to fetch metadata for each database to show table changes
    const diffResult = computePermissionsDiff(
      permissions,
      originalPermissions,
      groups,
      databasesResponse.data,
    );
    // Cast to PermissionsGraph - revision is not used by the confirm dialog
    return diffResult as unknown as PermissionsGraph;
  }, [permissions, originalPermissions, groups, databasesResponse?.data]);

  if (isLoading) {
    return (
      <Center h="100%">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <PermissionsPageLayout
      tab="data"
      onLoad={discardChanges}
      onSave={savePermissions}
      diff={diff}
      isDirty={isDirty}
      route={route}
      helpContent={<DataPermissionsHelp />}
      showSplitPermsModal={showSplitPermsModal}
    >
      {children}
    </PermissionsPageLayout>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataPermissionsPage;
