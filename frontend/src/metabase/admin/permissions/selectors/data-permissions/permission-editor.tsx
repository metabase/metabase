import type { Selector } from "@reduxjs/toolkit";
import { createSelector } from "@reduxjs/toolkit";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { Groups } from "metabase/entities/groups";
import { Tables } from "metabase/entities/tables";
import { getSpecialGroupType, isDefaultGroup } from "metabase/lib/groups";
import {
  PLUGIN_AUDIT,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import { getMetadataWithHiddenTables } from "metabase/selectors/metadata";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type { Database, Group, GroupsPermissions } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type {
  DataRouteParams,
  EntityId,
  PermissionEditorType,
  PermissionSectionConfig,
  PermissionSubject,
  RawGroupRouteParams,
  SpecialGroupType,
} from "../../types";
import { DataPermission, DataPermissionValue } from "../../types";
import {
  getDatabaseEntityId,
  getSchemaEntityId,
  getTableEntityId,
} from "../../utils/data-entity-id";
import { hasPermissionValueInEntityGraphs } from "../../utils/graph";

import {
  getDatabasesEditorBreadcrumbs,
  getGroupsDataEditorBreadcrumbs,
} from "./breadcrumbs";
import { buildFieldsPermissions } from "./fields";
import { getOrderedGroups } from "./groups";
import { buildSchemasPermissions } from "./schemas";
import { buildTablesPermissions } from "./tables";

const getGroupHint = (groupType: SpecialGroupType): string | null => {
  switch (groupType) {
    case "admin":
      return t`The Administrators group is special, and always has Unrestricted access.`;
    case "analyst":
      return t`The Data Analysts group always has full access to edit table metadata.`;
    default:
      return null;
  }
};

export const getIsLoadingDatabaseTables = (
  state: State,
  { params }: { params: Pick<RawGroupRouteParams, "databaseId"> },
) =>
  Tables.selectors.getLoading(state, {
    entityQuery: {
      dbId: params.databaseId,
      include_hidden: true,
    },
  });

export const getLoadingDatabaseTablesError = (
  state: State,
  { params }: { params: Pick<RawGroupRouteParams, "databaseId"> },
) => {
  return Tables.selectors.getError(state, {
    entityQuery: {
      dbId: params.databaseId,
      include_hidden: true,
    },
  });
};

type RouteParamsSelectorParameters = {
  params: DataRouteParams;
};

const getRouteParams = (
  _state: State,
  props: RouteParamsSelectorParameters,
) => {
  const { databaseId, schemaName, tableId } = props.params;
  return {
    databaseId,
    schemaName,
    tableId,
  };
};

export const getDataPermissions = (state: State) =>
  state.admin.permissions.dataPermissions;

const getOriginalDataPermissions = (state: State) =>
  state.admin.permissions.originalDataPermissions;

const getGroupRouteParams = (
  _state: State,
  props: { params: RawGroupRouteParams },
) => {
  const { groupId, databaseId, schemaName } = props.params;
  return {
    groupId: groupId != null ? parseInt(groupId) : undefined,
    databaseId: databaseId != null ? parseInt(databaseId) : undefined,
    schemaName,
  };
};

const getEditorEntityName = (
  { databaseId, schemaName }: DataRouteParams,
  hasSingleSchema: boolean,
) => {
  if (schemaName != null || hasSingleSchema) {
    return t`Table name`;
  } else if (databaseId) {
    return t`Schema name`;
  } else {
    return t`Database name`;
  }
};

const getFilterPlaceholder = (
  { databaseId, schemaName }: DataRouteParams,
  hasSingleSchema: boolean,
) => {
  if (schemaName != null || hasSingleSchema) {
    return t`Search for a table`;
  } else if (databaseId) {
    return t`Search for a schema`;
  } else {
    return t`Search for a database`;
  }
};

const getGroup = (state: State, props: { params: RawGroupRouteParams }) => {
  const groupId = props.params.groupId;

  if (!groupId) {
    return null;
  }

  return Groups.selectors.getObject(state, {
    entityId: parseInt(groupId),
  });
};

const hasViewDataOptions = (entities: any[]) => {
  return entities.some(
    (entity) =>
      entity.permissions?.findIndex(
        (permissionSectionConfig: any) =>
          permissionSectionConfig.permission === DataPermission.VIEW_DATA,
      ) > -1,
  );
};

type EntityWithPermissions = {
  id: string | number;
  name: string;
  entityId: EntityId;
  canSelect?: boolean;
  permissions: PermissionSectionConfig[];
  callout?: string;
};

export const getDatabasesPermissionEditor = createSelector(
  getMetadataWithHiddenTables,
  getGroupRouteParams,
  getDataPermissions,
  getOriginalDataPermissions,
  getGroup,
  Groups.selectors.getList,
  getIsLoadingDatabaseTables,
  (
    metadata,
    params,
    permissions: GroupsPermissions,
    originalPermissions: GroupsPermissions,
    group: Group,
    groups: Group[],
    isLoading,
  ) => {
    const { groupId, databaseId, schemaName } = params;

    if (isLoading || !permissions || groupId == null || !group) {
      return null;
    }

    const defaultGroup = _.find(groups, isDefaultGroup);
    const externalUsersGroup = _.find(
      groups,
      PLUGIN_TENANTS.isExternalUsersGroup,
    );

    if (!defaultGroup) {
      throw new Error("No default group found");
    }

    const isExternal =
      !!externalUsersGroup &&
      (PLUGIN_TENANTS.isExternalUsersGroup(group) ||
        PLUGIN_TENANTS.isTenantGroup(group));

    const groupType = getSpecialGroupType(group, isExternal);

    const hasSingleSchema =
      databaseId != null &&
      metadata.database(databaseId)?.getSchemas().length === 1;

    const database = metadata?.database(databaseId);

    let entities: EntityWithPermissions[] = [];
    let permissionSubject: PermissionSubject | null = null;

    if (database && (schemaName != null || hasSingleSchema)) {
      const schema: Schema = hasSingleSchema
        ? database.getSchemas()[0]
        : (database.schema(schemaName) as Schema);
      permissionSubject = "fields";
      entities = schema
        .getTables()
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
        .map((table) => {
          const entityId = getTableEntityId(table);
          return {
            id: table.id,
            name: table.display_name,
            entityId,
            permissions: buildFieldsPermissions(
              entityId,
              groupId,
              groupType,
              permissions,
              originalPermissions,
              isExternal ? externalUsersGroup : defaultGroup,
              database,
            ),
          };
        });
    } else if (database && databaseId != null) {
      const maybeDbEntities = metadata
        ?.database(databaseId)
        ?.getSchemas()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((schema) => {
          const entityId = getSchemaEntityId(schema);
          return {
            id: schema.id,
            name: schema.name,
            entityId,
            canSelect: true,
            permissions: buildTablesPermissions(
              entityId,
              groupId,
              groupType,
              permissions,
              originalPermissions,
              isExternal ? externalUsersGroup : defaultGroup,
              database,
            ),
          };
        });
      if (maybeDbEntities) {
        permissionSubject = "tables";
        entities = maybeDbEntities;
      }
    } else if (groupId != null) {
      permissionSubject = "schemas";
      entities = metadata
        .databasesList({ savedQuestions: false })
        .filter((db) => !PLUGIN_AUDIT.isAuditDb(db as Database))
        .map((database) => {
          const entityId = getDatabaseEntityId(database);
          return {
            id: database.id,
            name: database.name,
            entityId,
            callout: database.hasDatabaseRoutingEnabled()
              ? t`(Database routing enabled)`
              : undefined,
            canSelect: true,
            permissions: buildSchemasPermissions(
              entityId,
              groupId,
              groupType,
              permissions,
              originalPermissions,
              isExternal ? externalUsersGroup : defaultGroup,
              database,
              "group",
            ),
          };
        });
    }

    const showViewDataColumn = hasViewDataOptions(entities);

    const columns = _.compact([
      { name: getEditorEntityName(params, hasSingleSchema) },
      showViewDataColumn && { name: t`View data` },
      { name: t`Create queries` },
      ...(permissionSubject
        ? PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDataColumns(
            permissionSubject,
            groupType,
            isExternal,
          )
        : []),
    ]);

    const breadcrumbs = getDatabasesEditorBreadcrumbs(params, metadata, group);
    const title = t`Permissions for the `;

    const hasLegacyNoSelfServiceValueInPermissionGraph =
      hasPermissionValueInEntityGraphs(
        permissions,
        entities.map((entity: any) => ({ groupId, ...entity.entityId })),
        DataPermission.VIEW_DATA,
        DataPermissionValue.LEGACY_NO_SELF_SERVICE,
      );

    return {
      title,
      breadcrumbs,
      description:
        group != null
          ? ngettext(
              msgid`${group.member_count} person`,
              `${group.member_count} people`,
              group.member_count,
            )
          : null,
      filterPlaceholder: getFilterPlaceholder(params, hasSingleSchema),
      columns,
      entities,
      hasLegacyNoSelfServiceValueInPermissionGraph,
    };
  },
);

type GetGroupsDataPermissionEditorSelectorParameters =
  RouteParamsSelectorParameters & {
    includeHiddenTables?: boolean;
  };

type GetGroupsDataPermissionEditorSelector = Selector<
  State,
  PermissionEditorType | null,
  GetGroupsDataPermissionEditorSelectorParameters[]
>;

export const getGroupsDataPermissionEditor: GetGroupsDataPermissionEditorSelector =
  createSelector(
    getMetadataWithHiddenTables,
    getRouteParams,
    getDataPermissions,
    getOriginalDataPermissions,
    getOrderedGroups,
    (metadata, params, permissions, originalPermissions, groups) => {
      const { databaseId, schemaName, tableId } = params;
      const database = metadata?.database(databaseId);

      if (!permissions || databaseId == null || !database) {
        return null;
      }

      const sortedGroups = groups.flat();

      const defaultGroup = _.find(sortedGroups, isDefaultGroup);
      const allTenantUsersGroup = _.find(
        sortedGroups,
        PLUGIN_TENANTS.isExternalUsersGroup,
      );

      if (!defaultGroup) {
        throw new Error("No default group found");
      }

      const permissionSubject =
        tableId != null ? "fields" : schemaName != null ? "tables" : "schemas";

      const entities = sortedGroups.map((group) => {
        const isAllTenantUsersGroup =
          !!allTenantUsersGroup && PLUGIN_TENANTS.isExternalUsersGroup(group);

        const isTenantGroup = PLUGIN_TENANTS.isTenantGroup(group);
        const isExternal = isAllTenantUsersGroup || isTenantGroup;
        const groupType = getSpecialGroupType(group, isExternal);
        let groupPermissions;

        const shouldUseAllExternalUsersGroup =
          !!allTenantUsersGroup && (isAllTenantUsersGroup || isTenantGroup);

        if (tableId != null) {
          groupPermissions = buildFieldsPermissions(
            {
              databaseId,
              schemaName,
              tableId,
            },
            group.id,
            groupType,
            permissions,
            originalPermissions,
            shouldUseAllExternalUsersGroup ? allTenantUsersGroup : defaultGroup,
            database,
          );
        } else if (schemaName != null) {
          groupPermissions = buildTablesPermissions(
            {
              databaseId,
              schemaName,
            },
            group.id,
            groupType,
            permissions,
            originalPermissions,
            shouldUseAllExternalUsersGroup ? allTenantUsersGroup : defaultGroup,
            database,
          );
        } else if (databaseId != null) {
          groupPermissions = buildSchemasPermissions(
            {
              databaseId,
            },
            group.id,
            groupType,
            permissions,
            originalPermissions,
            shouldUseAllExternalUsersGroup ? allTenantUsersGroup : defaultGroup,
            database,
            "database",
          );
        }

        return {
          id: group.id,
          name: group.name,
          icon: isTenantGroup ? (
            <PLUGIN_TENANTS.TenantGroupHintIcon />
          ) : undefined,
          hint: getGroupHint(groupType),
          entityId: params,
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

      const hasLegacyNoSelfServiceValueInPermissionGraph =
        hasPermissionValueInEntityGraphs(
          permissions,
          entities.map((entity: any) => ({
            groupId: entity.id,
            ...entity.entityId,
          })),
          DataPermission.VIEW_DATA,
          DataPermissionValue.LEGACY_NO_SELF_SERVICE,
        );

      return {
        title: t`Permissions for`,
        filterPlaceholder: t`Search for a group`,
        breadcrumbs: getGroupsDataEditorBreadcrumbs(params, metadata),
        columns,
        entities,
        hasLegacyNoSelfServiceValueInPermissionGraph,
      };
    },
  );
