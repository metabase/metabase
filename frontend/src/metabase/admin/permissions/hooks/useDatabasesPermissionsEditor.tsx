import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
} from "metabase/api";
import { useListPermissionsGroupsQuery } from "metabase/api/permission";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import type { ConcreteTableId, Database, Group, GroupInfo , TableId } from "metabase-types/api";

import { buildFieldsPermissions } from "../selectors/data-permissions/fields";
import { buildSchemasPermissions } from "../selectors/data-permissions/schemas";
import { buildTablesPermissions } from "../selectors/data-permissions/tables";
import type {
  DatabaseEntityId,
  EntityId,
  PermissionSectionConfig,
  PermissionSubject,
  SchemaEntityId,
  TableEntityId,
} from "../types";
import { DataPermission, DataPermissionValue } from "../types";
import type { DatabasePermissionInfo } from "../utils/database-metadata";
import {
  getSchemaCount,
  getTable,
  hasDatabaseRouting,
  toDatabasePermissionInfo,
} from "../utils/database-metadata";
import { hasPermissionValueInEntityGraphs } from "../utils/graph";
import {
  getDatabaseFocusPermissionsUrl,
} from "../utils/urls";

import { useDataPermissionsState } from "./useDataPermissionsState";

type EditorBreadcrumb = {
  id?: number | string;
  text: string;
  subtext?: string;
  url?: string;
};

type EntityWithPermissions = {
  id: string | number;
  name: string;
  entityId: EntityId;
  icon?: React.ReactNode;
  hint?: string | null;
  permissions: PermissionSectionConfig[];
  /** The database permission info needed for permission updates */
  database: DatabasePermissionInfo;
};

export type DatabasesPermissionsEditorType = null | {
  title: string;
  filterPlaceholder: string;
  breadcrumbs: EditorBreadcrumb[] | null;
  columns: { name: string }[];
  entities: EntityWithPermissions[];
  hasLegacyNoSelfServiceValueInPermissionGraph: boolean;
  isLoading: boolean;
  error: unknown;
};

type UseDatabasesPermissionsEditorParams = {
  databaseId?: number;
  schemaName?: string;
  tableId?: TableId;
};

const isPinnedGroup = (group: Group | GroupInfo) =>
  isAdminGroup(group) || isDefaultGroup(group);

/**
 * Orders groups for display: pinned (admin, default), then tenant groups, then others.
 */
function orderGroups(groups: GroupInfo[]): GroupInfo[] {
  const [pinnedGroups, unpinnedGroups] = _.partition(groups, isPinnedGroup);
  const [tenantGroups, regularGroups] = _.partition(
    unpinnedGroups,
    PLUGIN_TENANTS.isTenantGroup,
  );
  return [...pinnedGroups, ...tenantGroups, ...regularGroups];
}

function hasViewDataOptions(entities: EntityWithPermissions[]) {
  return entities.some(
    (entity) =>
      entity.permissions?.findIndex(
        (permissionSectionConfig) =>
          permissionSectionConfig.permission === DataPermission.VIEW_DATA,
      ) > -1,
  );
}

function buildBreadcrumbs(
  database: Database,
  schemaName: string | undefined,
  tableId: TableId | undefined,
): EditorBreadcrumb[] {
  const entityId: DatabaseEntityId = { databaseId: database.id };
  const databaseItem: EditorBreadcrumb = {
    text: database.name,
    subtext: hasDatabaseRouting(database)
      ? t`(Database routing enabled)`
      : undefined,
    id: database.id,
    url: getDatabaseFocusPermissionsUrl(entityId),
  };

  const hasMultipleSchemas = getSchemaCount(database) > 1;

  if (schemaName == null && tableId == null) {
    return [databaseItem];
  }

  if (schemaName == null) {
    return [databaseItem];
  }

  const schemaEntityId: SchemaEntityId = {
    databaseId: database.id,
    schemaName,
  };
  const schemaItem: EditorBreadcrumb = {
    id: schemaName,
    text: schemaName || t`(empty schema)`,
    url: getDatabaseFocusPermissionsUrl(schemaEntityId),
  };

  if (tableId == null) {
    return hasMultipleSchemas ? [databaseItem, schemaItem] : [databaseItem];
  }

  const table = getTable(database, tableId as number);
  const tableItem: EditorBreadcrumb = {
    id: tableId,
    text: table?.display_name ?? table?.name ?? String(tableId),
  };

  return hasMultipleSchemas
    ? [databaseItem, schemaItem, tableItem]
    : [databaseItem, tableItem];
}

/**
 * Hook for the "by database" permissions editor view.
 * Shows groups and their permissions for a selected database/schema/table.
 */
export function useDatabasesPermissionsEditor({
  databaseId,
  schemaName,
  tableId,
}: UseDatabasesPermissionsEditorParams): DatabasesPermissionsEditorType {
  // Fetch groups
  const {
    data: groups,
    isLoading: isLoadingGroups,
    error: groupsError,
  } = useListPermissionsGroupsQuery({});

  // Fetch database metadata if a database is selected
  const {
    data: databaseMetadata,
    isLoading: isLoadingMetadata,
    error: metadataError,
  } = useGetDatabaseMetadataQuery(
    databaseId != null
      ? {
          id: databaseId,
          include_hidden: true,
          remove_inactive: true,
          skip_fields: true,
        }
      : skipToken,
  );

  // Get permissions state
  const {
    permissions,
    originalPermissions,
    isLoading: isLoadingPermissions,
    error: permissionsError,
  } = useDataPermissionsState({});

  const isLoading =
    isLoadingGroups || isLoadingMetadata || isLoadingPermissions;

  const error = groupsError || metadataError || permissionsError;

  const editor = useMemo((): DatabasesPermissionsEditorType => {
    if (isLoading) {
      return {
        title: "",
        filterPlaceholder: "",
        breadcrumbs: null,
        columns: [],
        entities: [],
        hasLegacyNoSelfServiceValueInPermissionGraph: false,
        isLoading: true,
        error: null,
      };
    }

    if (!permissions || databaseId == null || !databaseMetadata || !groups) {
      return null;
    }

    const orderedGroups = orderGroups(groups);
    const defaultGroup = groups.find(isDefaultGroup);
    const externalUsersGroup = groups.find(PLUGIN_TENANTS.isExternalUsersGroup);

    if (!defaultGroup) {
      return null;
    }

    const dbPermissionInfo = toDatabasePermissionInfo(databaseMetadata);

    const permissionSubject: PermissionSubject =
      tableId != null ? "fields" : schemaName != null ? "tables" : "schemas";

    const entities: EntityWithPermissions[] = orderedGroups.map((group) => {
      const isAdmin = isAdminGroup(group);
      const isExternal =
        !!externalUsersGroup && PLUGIN_TENANTS.isExternalUsersGroup(group);
      const isTenantGroup = PLUGIN_TENANTS.isTenantGroup(group);

      let groupPermissions: PermissionSectionConfig[];

      if (tableId != null) {
        const entityId: TableEntityId = {
          databaseId,
          schemaName: schemaName ?? "",
          tableId: tableId as ConcreteTableId,
        };
        groupPermissions = buildFieldsPermissions(
          entityId,
          group.id,
          isAdmin,
          isExternal,
          permissions,
          originalPermissions,
          (isExternal ? externalUsersGroup : defaultGroup) as any,
          dbPermissionInfo,
        );
      } else if (schemaName != null) {
        const entityId: SchemaEntityId = {
          databaseId,
          schemaName,
        };
        groupPermissions = buildTablesPermissions(
          entityId,
          group.id,
          isAdmin,
          isExternal,
          permissions,
          originalPermissions,
          (isExternal ? externalUsersGroup : defaultGroup) as any,
          dbPermissionInfo,
        );
      } else {
        const entityId: DatabaseEntityId = {
          databaseId,
        };
        groupPermissions = buildSchemasPermissions(
          entityId,
          group.id,
          isAdmin,
          isExternal,
          permissions,
          originalPermissions,
          (isExternal ? externalUsersGroup : defaultGroup) as any,
          dbPermissionInfo,
          "database",
        );
      }

      // Build entity ID for the group's row
      const entityId: EntityId = tableId != null
        ? { databaseId, schemaName: schemaName ?? "", tableId: tableId as ConcreteTableId }
        : schemaName != null
          ? { databaseId, schemaName }
          : { databaseId };

      return {
        id: group.id,
        name: group.name,
        icon: isTenantGroup ? (
          <PLUGIN_TENANTS.TenantGroupHintIcon />
        ) : undefined,
        hint: isAdmin
          ? t`The Administrators group is special, and always has Unrestricted access.`
          : null,
        entityId,
        database: dbPermissionInfo,
        permissions: groupPermissions,
      };
    });

    const showViewDataColumn = hasViewDataOptions(entities);

    const columns = _.compact([
      { name: t`Group name` },
      showViewDataColumn && { name: t`View data` },
      { name: t`Create queries` },
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDataColumns(permissionSubject),
    ]);

    const breadcrumbs = buildBreadcrumbs(databaseMetadata, schemaName, tableId);

    const hasLegacyNoSelfServiceValueInPermissionGraph =
      hasPermissionValueInEntityGraphs(
        permissions,
        entities.map((entity) => ({
          groupId: entity.id as number,
          ...entity.entityId,
        })),
        DataPermission.VIEW_DATA,
        DataPermissionValue.LEGACY_NO_SELF_SERVICE,
      );

    return {
      title: t`Permissions for`,
      filterPlaceholder: t`Search for a group`,
      breadcrumbs,
      columns,
      entities,
      hasLegacyNoSelfServiceValueInPermissionGraph,
      isLoading: false,
      error: null,
    };
  }, [
    isLoading,
    permissions,
    originalPermissions,
    databaseId,
    schemaName,
    tableId,
    groups,
    databaseMetadata,
  ]);

  if (error) {
    return {
      title: "",
      filterPlaceholder: "",
      breadcrumbs: null,
      columns: [],
      entities: [],
      hasLegacyNoSelfServiceValueInPermissionGraph: false,
      isLoading: false,
      error,
    };
  }

  return editor;
}
