import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useListPermissionsGroupsQuery } from "metabase/api/permission";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import {
  PLUGIN_AUDIT,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import type { ConcreteTableId, Database, GroupId , GroupInfo } from "metabase-types/api";

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
  getSchemas,
  getSingleSchema,
  getTablesForSchema,
  hasDatabaseRouting,
  hasSingleSchema,
  toDatabasePermissionInfo,
} from "../utils/database-metadata";
import { hasPermissionValueInEntityGraphs } from "../utils/graph";
import { getGroupFocusPermissionsUrl } from "../utils/urls";

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
  canSelect?: boolean;
  permissions: PermissionSectionConfig[];
  callout?: string;
  /** The database permission info needed for permission updates */
  database: DatabasePermissionInfo;
};

export type GroupsPermissionsEditorType = null | {
  title: string;
  description: string | null;
  filterPlaceholder: string;
  breadcrumbs: EditorBreadcrumb[] | null;
  columns: { name: string }[];
  entities: EntityWithPermissions[];
  hasLegacyNoSelfServiceValueInPermissionGraph: boolean;
  isLoading: boolean;
  error: unknown;
};

type UseGroupsPermissionsEditorParams = {
  groupId?: GroupId;
  databaseId?: number;
  schemaName?: string;
};

const getEditorEntityName = (
  databaseId?: number,
  schemaName?: string,
  hasSingleSchemaDb?: boolean,
) => {
  if (schemaName != null || hasSingleSchemaDb) {
    return t`Table name`;
  } else if (databaseId != null) {
    return t`Schema name`;
  } else {
    return t`Database name`;
  }
};

const getFilterPlaceholder = (
  databaseId?: number,
  schemaName?: string,
  hasSingleSchemaDb?: boolean,
) => {
  if (schemaName != null || hasSingleSchemaDb) {
    return t`Search for a table`;
  } else if (databaseId != null) {
    return t`Search for a schema`;
  } else {
    return t`Search for a database`;
  }
};

function buildBreadcrumbs(
  group: GroupInfo,
  databaseId: number | undefined,
  schemaName: string | undefined,
  database: Database | undefined,
): EditorBreadcrumb[] | null {
  if (!group) {
    return null;
  }

  const groupItem: EditorBreadcrumb = {
    id: group.id,
    text: `${group.name} group`,
    url: getGroupFocusPermissionsUrl(group.id),
  };

  if (databaseId == null || !database) {
    return [groupItem];
  }

  const databaseEntityId: DatabaseEntityId = { databaseId: database.id };
  const databaseItem: EditorBreadcrumb = {
    id: database.id,
    text: database.name,
    subtext: hasDatabaseRouting(database)
      ? t`(Database routing enabled)`
      : undefined,
    url: getGroupFocusPermissionsUrl(group.id, databaseEntityId),
  };

  if (schemaName == null) {
    return [groupItem, databaseItem];
  }

  const schemaItem: EditorBreadcrumb = {
    id: schemaName,
    text: schemaName,
  };
  return [groupItem, databaseItem, schemaItem];
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

export function useGroupsPermissionsEditor({
  groupId,
  databaseId,
  schemaName,
}: UseGroupsPermissionsEditorParams): GroupsPermissionsEditorType {
  // Fetch groups
  const {
    data: groups,
    isLoading: isLoadingGroups,
    error: groupsError,
  } = useListPermissionsGroupsQuery({});

  // Fetch all databases for the list view
  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
  } = useListDatabasesQuery({ include_only_uploadable: false });

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
  } = useDataPermissionsState({ groupId });

  const isLoading =
    isLoadingGroups ||
    isLoadingDatabases ||
    isLoadingMetadata ||
    isLoadingPermissions;

  const error = groupsError || metadataError || permissionsError;

  const editor = useMemo((): GroupsPermissionsEditorType => {
    if (isLoading) {
      return {
        title: "",
        description: null,
        filterPlaceholder: "",
        breadcrumbs: null,
        columns: [],
        entities: [],
        hasLegacyNoSelfServiceValueInPermissionGraph: false,
        isLoading: true,
        error: null,
      };
    }

    if (!permissions || groupId == null || !groups) {
      return null;
    }

    const group = groups.find((g) => g.id === groupId);
    if (!group) {
      return null;
    }

    const isAdmin = isAdminGroup(group);
    const defaultGroup = groups.find(isDefaultGroup);
    const externalUsersGroup = groups.find(PLUGIN_TENANTS.isExternalUsersGroup);

    if (!defaultGroup) {
      return null;
    }

    const isExternal =
      !!externalUsersGroup &&
      (PLUGIN_TENANTS.isExternalUsersGroup(group) ||
        PLUGIN_TENANTS.isTenantGroup(group));

    const hasSingleSchemaDb =
      databaseId != null && databaseMetadata
        ? hasSingleSchema(databaseMetadata)
        : false;

    let entities: EntityWithPermissions[] = [];
    let permissionSubject: PermissionSubject | null = null;

    if (databaseMetadata && (schemaName != null || hasSingleSchemaDb)) {
      // Table level - show tables in schema
      const effectiveSchemaName = hasSingleSchemaDb
        ? getSingleSchema(databaseMetadata)?.name ?? ""
        : schemaName ?? "";

      const tables = getTablesForSchema(databaseMetadata, effectiveSchemaName);
      const dbPermissionInfo = toDatabasePermissionInfo(databaseMetadata);

      permissionSubject = "fields";
      entities = tables.map((table) => {
        const entityId: TableEntityId = {
          databaseId: databaseMetadata.id,
          schemaName: table.schema ?? "",
          tableId: table.id as ConcreteTableId,
        };
        return {
          id: table.id,
          name: table.display_name ?? table.name,
          entityId,
          database: dbPermissionInfo,
          permissions: buildFieldsPermissions(
            entityId,
            groupId,
            isAdmin,
            isExternal,
            permissions,
            originalPermissions,
            // Cast is safe: GroupInfo has id/name which is what's used
            (isExternal ? externalUsersGroup : defaultGroup) as any,
            dbPermissionInfo,
          ),
        };
      });
    } else if (databaseMetadata && databaseId != null) {
      // Schema level - show schemas in database
      const schemas = getSchemas(databaseMetadata);
      const dbPermissionInfo = toDatabasePermissionInfo(databaseMetadata);

      permissionSubject = "tables";
      entities = schemas.map((schema) => {
        const entityId: SchemaEntityId = {
          databaseId: databaseMetadata.id,
          schemaName: schema.name,
        };
        return {
          id: schema.name || "(empty schema)",
          name: schema.name || t`(empty schema)`,
          entityId,
          canSelect: true,
          database: dbPermissionInfo,
          permissions: buildTablesPermissions(
            entityId,
            groupId,
            isAdmin,
            isExternal,
            permissions,
            originalPermissions,
            (isExternal ? externalUsersGroup : defaultGroup) as any,
            dbPermissionInfo,
          ),
        };
      });
    } else if (groupId != null && databasesResponse?.data) {
      // Database level - show all databases
      const databases = databasesResponse.data.filter(
        (db) => !PLUGIN_AUDIT.isAuditDb(db),
      );

      permissionSubject = "schemas";
      entities = databases.map((database) => {
        const entityId: DatabaseEntityId = { databaseId: database.id };
        const dbPermissionInfo = toDatabasePermissionInfo(database);
        return {
          id: database.id,
          name: database.name,
          entityId,
          callout: hasDatabaseRouting(database)
            ? t`(Database routing enabled)`
            : undefined,
          canSelect: true,
          database: dbPermissionInfo,
          permissions: buildSchemasPermissions(
            entityId,
            groupId,
            isAdmin,
            isExternal,
            permissions,
            originalPermissions,
            (isExternal ? externalUsersGroup : defaultGroup) as any,
            dbPermissionInfo,
            "group",
          ),
        };
      });
    }

    const showViewDataColumn = hasViewDataOptions(entities);

    const columns = _.compact([
      { name: getEditorEntityName(databaseId, schemaName, hasSingleSchemaDb) },
      showViewDataColumn && { name: t`View data` },
      { name: t`Create queries` },
      ...(permissionSubject
        ? PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDataColumns(
            permissionSubject,
            isExternal,
          )
        : []),
    ]);

    const breadcrumbs = buildBreadcrumbs(
      group,
      databaseId,
      schemaName,
      databaseMetadata,
    );

    const hasLegacyNoSelfServiceValueInPermissionGraph =
      hasPermissionValueInEntityGraphs(
        permissions,
        entities.map((entity) => ({ groupId, ...entity.entityId })),
        DataPermission.VIEW_DATA,
        DataPermissionValue.LEGACY_NO_SELF_SERVICE,
      );

    return {
      title: t`Permissions for the `,
      description:
        group != null
          ? ngettext(
              msgid`${group.member_count ?? 0} person`,
              `${group.member_count ?? 0} people`,
              group.member_count ?? 0,
            )
          : null,
      filterPlaceholder: getFilterPlaceholder(
        databaseId,
        schemaName,
        hasSingleSchemaDb,
      ),
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
    groupId,
    databaseId,
    schemaName,
    groups,
    databasesResponse,
    databaseMetadata,
  ]);

  if (error) {
    return {
      title: "",
      description: null,
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
