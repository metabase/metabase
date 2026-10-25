import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { hasDbRoutingEnabled } from "metabase/common/utils/database";
import {
  getSpecialGroupType,
  isDefaultGroup,
} from "metabase/common/utils/groups";
import {
  PLUGIN_AUDIT,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import { getPlan } from "metabase/settings";
import type {
  GroupInfo,
  GroupsPermissions,
  PermissionEntityId,
  PermissionSubject,
  PermissionsDatabase,
  SpecialGroupType,
  TokenFeatures,
} from "metabase-types/api";
import { DataPermission, DataPermissionValue } from "metabase-types/api";

import type {
  DataRouteParams,
  GroupRouteParams,
  PermissionEditorType,
  PermissionSectionConfig,
} from "../types";

import {
  getDatabasesEditorBreadcrumbs,
  getGroupsDataEditorBreadcrumbs,
} from "./data-breadcrumbs";
import {
  buildFieldsPermissions,
  buildSchemasPermissions,
  buildTablesPermissions,
} from "./data-sections";
import {
  getDatabaseEntityId,
  getSchemaEntityId,
  getTableEntityId,
} from "./entity-ids";
import { hasPermissionValueInEntityGraphs } from "./graph";
import { getOrderedGroups } from "./groups";
import { getDatabaseSchema, getDatabaseSchemas } from "./metadata";

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
  entityId: PermissionEntityId;
  canSelect?: boolean;
  permissions: PermissionSectionConfig[];
  callout?: string;
};

type TransformPermissionsSettings = {
  tokenFeatures: TokenFeatures;
  isHosted: boolean;
  isTransformsEnabled: boolean;
};

export const getShouldShowTransformPermissions = ({
  tokenFeatures,
  isHosted,
  isTransformsEnabled,
}: TransformPermissionsSettings) => {
  if (getPlan(tokenFeatures) === "oss") {
    return false;
  }
  if (!isHosted && tokenFeatures["transforms-basic"] && isTransformsEnabled) {
    return true;
  }
  if (isHosted && tokenFeatures["transforms-basic"]) {
    return true;
  }
  return false;
};

type DatabasesPermissionEditorOpts = {
  params: GroupRouteParams;
  databases: PermissionsDatabase[];
  database: PermissionsDatabase | undefined;
  permissions: GroupsPermissions;
  originalPermissions: GroupsPermissions;
  groups: GroupInfo[];
  showTransformPermissions: boolean;
};

export const getDatabasesPermissionEditor = ({
  params,
  databases,
  database,
  permissions,
  originalPermissions,
  groups,
  showTransformPermissions,
}: DatabasesPermissionEditorOpts): PermissionEditorType | null => {
  const { groupId, databaseId, schemaName } = params;
  const group = groups.find((group) => group.id === groupId);

  if (groupId == null || !group) {
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

  const schemas = database ? getDatabaseSchemas(database) : [];
  const hasSingleSchema = databaseId != null && schemas.length === 1;

  let entities: EntityWithPermissions[] = [];
  let permissionSubject: PermissionSubject | null = null;

  if (database && (schemaName != null || hasSingleSchema)) {
    const schema = hasSingleSchema
      ? schemas[0]
      : getDatabaseSchema(database, schemaName);
    permissionSubject = "fields";
    entities = (schema?.tables ?? [])
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .map((table) => {
        const entityId = getTableEntityId(table);
        return {
          id: table.id,
          name: table.display_name,
          entityId,
          permissions: buildFieldsPermissions({
            entityId,
            groupId,
            groupType,
            permissions,
            originalPermissions,
            defaultGroup: isExternal ? externalUsersGroup : defaultGroup,
            database,
            showTransformPermissions,
          }),
        };
      });
  } else if (database && databaseId != null) {
    const maybeDbEntities = schemas
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((schema) => {
        const entityId = getSchemaEntityId(schema);
        return {
          id: schema.id,
          name: schema.name,
          entityId,
          canSelect: true,
          permissions: buildTablesPermissions({
            entityId,
            groupId,
            groupType,
            permissions,
            originalPermissions,
            defaultGroup: isExternal ? externalUsersGroup : defaultGroup,
            database,
            showTransformPermissions,
          }),
        };
      });
    if (maybeDbEntities) {
      permissionSubject = "tables";
      entities = maybeDbEntities;
    }
  } else if (groupId != null) {
    permissionSubject = "schemas";
    entities = databases
      .filter((db) => !db.is_saved_questions)
      .filter((db) => !PLUGIN_AUDIT.isAuditDb(db))
      .filter((db) => !db.router_database_id)
      .map((database) => {
        const entityId = getDatabaseEntityId(database);
        return {
          id: database.id,
          name: database.name,
          entityId,
          callout: hasDbRoutingEnabled(database)
            ? t`(Database routing enabled)`
            : undefined,
          canSelect: true,
          permissions: buildSchemasPermissions({
            entityId,
            groupId,
            groupType,
            permissions,
            originalPermissions,
            defaultGroup: isExternal ? externalUsersGroup : defaultGroup,
            database,
            permissionView: "group",
            showTransformPermissions,
          }),
        };
      });
  }

  const showViewDataColumn = hasViewDataOptions(entities);

  const columns = _.compact([
    { name: getEditorEntityName(params, hasSingleSchema) },
    showViewDataColumn && { name: t`View data` },
    { name: t`Create queries` },
    ...(permissionSubject
      ? PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDataColumns({
          subject: permissionSubject,
          groupType,
          isExternal,
          showTransformPermissions,
        })
      : []),
  ]);

  const breadcrumbs = getDatabasesEditorBreadcrumbs(params, database, group);
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
      typeof group?.member_count === "number"
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
};

type GroupsDataPermissionEditorOpts = {
  params: DataRouteParams;
  database: PermissionsDatabase | undefined;
  permissions: GroupsPermissions;
  originalPermissions: GroupsPermissions;
  groups: GroupInfo[];
  showTransformPermissions: boolean;
};

export const getGroupsDataPermissionEditor = ({
  params,
  database,
  permissions,
  originalPermissions,
  groups,
  showTransformPermissions,
}: GroupsDataPermissionEditorOpts): PermissionEditorType | null => {
  const { databaseId, schemaName, tableId } = params;

  if (databaseId == null || !database) {
    return null;
  }

  const sortedGroups = getOrderedGroups(groups).flat();

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
      groupPermissions = buildFieldsPermissions({
        entityId: {
          databaseId,
          schemaName,
          tableId,
        },
        groupId: group.id,
        groupType,
        permissions,
        originalPermissions,
        defaultGroup: shouldUseAllExternalUsersGroup
          ? allTenantUsersGroup
          : defaultGroup,
        database,
        showTransformPermissions,
      });
    } else if (schemaName != null) {
      groupPermissions = buildTablesPermissions({
        entityId: {
          databaseId,
          schemaName,
        },
        groupId: group.id,
        groupType,
        permissions,
        originalPermissions,
        defaultGroup: shouldUseAllExternalUsersGroup
          ? allTenantUsersGroup
          : defaultGroup,
        database,
        showTransformPermissions,
      });
    } else if (databaseId != null) {
      groupPermissions = buildSchemasPermissions({
        entityId: {
          databaseId,
        },
        groupId: group.id,
        groupType,
        permissions,
        originalPermissions,
        defaultGroup: shouldUseAllExternalUsersGroup
          ? allTenantUsersGroup
          : defaultGroup,
        database,
        permissionView: "database",
        showTransformPermissions,
      });
    }

    return {
      id: group.id,
      name: group.name,
      icon: isTenantGroup ? <PLUGIN_TENANTS.TenantGroupHintIcon /> : undefined,
      hint: getGroupHint(groupType),
      entityId: {
        databaseId,
        schemaName,
        tableId,
      },
      permissions: groupPermissions,
    };
  });

  const showViewDataColumn = hasViewDataOptions(entities);

  const columns = _.compact([
    { name: t`Group name` },
    showViewDataColumn && { name: t`View data` },
    { name: t`Create queries` },
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDataColumns({
      subject: permissionSubject,
      showTransformPermissions,
    }),
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
    breadcrumbs: getGroupsDataEditorBreadcrumbs(params, database),
    columns,
    entities,
    hasLegacyNoSelfServiceValueInPermissionGraph,
  };
};
