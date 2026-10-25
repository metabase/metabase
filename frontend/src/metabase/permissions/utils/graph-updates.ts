import { getIn, setIn } from "icepick";
import _ from "underscore";

import {
  type AppliedDataPermissionUpdate,
  PLUGIN_DATA_PERMISSIONS,
} from "metabase/plugins";
import {
  type CollectionPermissions,
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
  type DatabaseEntityId,
  type GroupsPermissions,
  type PermissionEntityId,
  type PermissionsDatabase,
  type SchemaEntityId,
  type TableEntityId,
} from "metabase-types/api";

import {
  getFieldsPermission,
  getPermissionPath,
  getSchemasPermission,
  isRestrictivePermission,
} from "./graph";
import {
  getDatabaseSchema,
  getDatabaseSchemaNames,
  isSchemaEntityId,
  isTableEntityId,
  isTableUnderEntityId,
  tableToTableEntityId,
} from "./metadata";

function updatePermission(
  permissions: GroupsPermissions,
  groupId: number,
  databaseId: number,
  permission: DataPermission,
  path: Array<number | string>,
  value: string | undefined,
  entityIds?: any[],
) {
  const fullPath = getPermissionPath(groupId, databaseId, permission, path);
  const current = getIn(permissions, fullPath);

  if (
    current === value ||
    (current &&
      typeof current === "object" &&
      value === DataPermissionValue.CONTROLLED)
  ) {
    return permissions;
  }
  let newValue: any;
  if (value === DataPermissionValue.CONTROLLED) {
    newValue = {};
    if (entityIds) {
      for (const entityId of entityIds) {
        newValue[entityId] = current;
      }
    }
  } else {
    newValue = value;
  }
  for (let i = 0; i < fullPath.length; i++) {
    if (typeof getIn(permissions, fullPath.slice(0, i)) === "string") {
      permissions = setIn(permissions, fullPath.slice(0, i), {});
    }
  }
  return setIn(permissions, fullPath, newValue);
}

function updateFieldsPermission(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: TableEntityId,
  value: any,
  database: PermissionsDatabase,
  permission: DataPermission,
) {
  const { databaseId, tableId } = entityId;
  const schemaName = entityId.schemaName || "";

  permissions = updateTablesPermission(
    permissions,
    groupId,
    { databaseId, schemaName },
    DataPermissionValue.CONTROLLED,
    database,
    permission,
  );
  permissions = updatePermission(
    permissions,
    groupId,
    databaseId,
    permission,
    [schemaName, tableId],
    value,
  );
  return permissions;
}

function updateTablesPermission(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId, schemaName }: SchemaEntityId,
  value: any,
  database: PermissionsDatabase,
  permission: DataPermission,
) {
  const schema = getDatabaseSchema(database, schemaName);
  const tableIds = schema?.tables.map((table) => table.id);

  permissions = updateSchemasPermission(
    permissions,
    groupId,
    { databaseId },
    DataPermissionValue.CONTROLLED,
    database,
    permission,
  );
  permissions = updatePermission(
    permissions,
    groupId,
    databaseId,
    permission,
    [schemaName || ""],
    value,
    tableIds,
  );

  return permissions;
}

function updateSchemasPermission(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  value: DataPermissionValue,
  database: PermissionsDatabase,
  permission: DataPermission,
) {
  const schemaNames = getDatabaseSchemaNames(database);
  const schemaNamesOrNoSchema =
    schemaNames &&
    schemaNames.length > 0 &&
    !(schemaNames.length === 1 && schemaNames[0] === null)
      ? schemaNames
      : [""];

  return updatePermission(
    permissions,
    groupId,
    databaseId,
    permission,
    [],
    value,
    schemaNamesOrNoSchema,
  );
}

export function updateEntityPermission(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: PermissionEntityId,
  value: DataPermissionValue,
  database: PermissionsDatabase,
  permission: DataPermission,
) {
  if (isTableEntityId(entityId)) {
    return updateFieldsPermission(
      permissions,
      groupId,
      entityId,
      value,
      database,
      permission,
    );
  } else if (isSchemaEntityId(entityId)) {
    return updateTablesPermission(
      permissions,
      groupId,
      entityId,
      value,
      database,
      permission,
    );
  } else {
    return updateSchemasPermission(
      permissions,
      groupId,
      entityId,
      value,
      database,
      permission,
    );
  }
}

function restrictCreateQueriesPermissionsIfNeeded(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: PermissionEntityId,
  permission: DataPermission,
  value: DataPermissionValue,
  database: PermissionsDatabase,
) {
  const currDbCreateQueriesPermission = getSchemasPermission(
    permissions,
    groupId,
    { databaseId: entityId.databaseId },
    DataPermission.CREATE_QUERIES,
  );

  const isMakingGranularCreateQueriesChange =
    permission === DataPermission.CREATE_QUERIES &&
    value !== DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    (entityId.tableId != null || entityId.schemaName != null) &&
    currDbCreateQueriesPermission ===
      DataPermissionValue.QUERY_BUILDER_AND_NATIVE;

  const shouldRestrictForSomeReason =
    PLUGIN_DATA_PERMISSIONS.shouldRestrictNativeQueryPermissions(
      permissions,
      groupId,
      entityId,
      permission,
      value,
      database,
    );

  const shouldRestrictNative =
    isMakingGranularCreateQueriesChange || shouldRestrictForSomeReason;

  if (shouldRestrictNative) {
    const schemaNames = getDatabaseSchemaNames(database);

    schemaNames.forEach((schemaName) => {
      permissions = updateTablesPermission(
        permissions,
        groupId,
        {
          databaseId: entityId.databaseId,
          schemaName,
        },
        DataPermissionValue.QUERY_BUILDER,
        database,
        DataPermission.CREATE_QUERIES,
      );
    });
  }

  if (
    isRestrictivePermission(value) ||
    value === DataPermissionValue.LEGACY_NO_SELF_SERVICE
  ) {
    permissions = updateEntityPermission(
      permissions,
      groupId,
      entityId,
      DataPermissionValue.NO,
      database,
      DataPermission.CREATE_QUERIES,
    );
  }

  return permissions;
}

const hasFullViewDataAccess = (viewDataValue: DataPermissionValue): boolean => {
  return viewDataValue === DataPermissionValue.UNRESTRICTED;
};

const hasFullCreateQueriesAccess = (
  createQueriesValue: DataPermissionValue,
): boolean => {
  return createQueriesValue === DataPermissionValue.QUERY_BUILDER_AND_NATIVE;
};

function revokeTransformsPermissionIfNeeded(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: PermissionEntityId,
  permission: DataPermission,
  value: DataPermissionValue,
): GroupsPermissions {
  if (
    permission !== DataPermission.VIEW_DATA &&
    permission !== DataPermission.CREATE_QUERIES
  ) {
    return permissions;
  }

  const { databaseId } = entityId;

  const viewDataValue =
    permission === DataPermission.VIEW_DATA
      ? value
      : getSchemasPermission(
          permissions,
          groupId,
          { databaseId },
          DataPermission.VIEW_DATA,
        );

  const createQueriesValue =
    permission === DataPermission.CREATE_QUERIES
      ? value
      : getSchemasPermission(
          permissions,
          groupId,
          { databaseId },
          DataPermission.CREATE_QUERIES,
        );

  const hasRequiredPermissions =
    hasFullViewDataAccess(viewDataValue) &&
    hasFullCreateQueriesAccess(createQueriesValue);

  if (!hasRequiredPermissions) {
    return updatePermission(
      permissions,
      groupId,
      databaseId,
      DataPermission.TRANSFORMS,
      [],
      DataPermissionValue.NO,
    );
  }

  return permissions;
}

function inferEntityPermissionValueFromChildTables(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: PermissionEntityId,
  database: PermissionsDatabase,
  permission: DataPermission,
): DataPermissionValue {
  const entityIdsForDescendantTables = _.chain(database.tables)
    .filter((table) => isTableUnderEntityId(table, entityId))
    .map(tableToTableEntityId)
    .value();

  const entityIdsByPermValue = _.chain(entityIdsForDescendantTables)
    .map((id) => getFieldsPermission(permissions, groupId, id, permission))
    .groupBy(_.identity)
    .value();

  // Unjustified type cast. FIXME
  const keys = Object.keys(entityIdsByPermValue) as DataPermissionValue[];
  const allTablesHaveSamePermissions = keys.length === 1;

  if (allTablesHaveSamePermissions) {
    return keys[0];
  } else {
    return DataPermissionValue.CONTROLLED;
  }
}

// Checks the child tables of a given entityId and updates the shared table and/or schema permission values according to table permissions
// This method was added for keeping the UI in sync when modifying child permissions
function inferAndUpdateEntityPermissions(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: PermissionEntityId,
  database: PermissionsDatabase,
  permission: DataPermission,
) {
  const { databaseId } = entityId;
  // Unjustified type cast. FIXME
  const schemaName = (entityId as SchemaEntityId).schemaName ?? "";

  if (schemaName) {
    // Check all tables for current schema if their shared schema-level permission value should be updated
    const tablesPermissionValue = inferEntityPermissionValueFromChildTables(
      permissions,
      groupId,
      { databaseId, schemaName },
      database,
      permission,
    );
    permissions = updateTablesPermission(
      permissions,
      groupId,
      { databaseId, schemaName },
      tablesPermissionValue,
      database,
      permission,
    );
  }

  if (databaseId) {
    // Check all tables for current database if schemas' shared database-level permission value should be updated
    const schemasPermissionValue = inferEntityPermissionValueFromChildTables(
      permissions,
      groupId,
      { databaseId },
      database,
      permission,
    );
    permissions = updateSchemasPermission(
      permissions,
      groupId,
      { databaseId },
      schemasPermissionValue,
      database,
      permission,
    );
  }

  return permissions;
}

export function applyDataPermissionUpdate(
  permissions: GroupsPermissions,
  {
    groupId,
    entityId,
    type,
    permission,
    value,
    database,
  }: AppliedDataPermissionUpdate,
): GroupsPermissions {
  if (type === DataPermissionType.DETAILS) {
    return updatePermission(
      permissions,
      groupId,
      entityId.databaseId,
      DataPermission.DETAILS,
      [],
      value,
    );
  }

  if (type === DataPermissionType.TRANSFORMS) {
    return updatePermission(
      permissions,
      groupId,
      entityId.databaseId,
      DataPermission.TRANSFORMS,
      [],
      value,
    );
  }

  let updatedPermissions = permissions;
  if (
    type === DataPermissionType.NATIVE &&
    PLUGIN_DATA_PERMISSIONS.upgradeViewPermissionsIfNeeded
  ) {
    updatedPermissions = PLUGIN_DATA_PERMISSIONS.upgradeViewPermissionsIfNeeded(
      updatedPermissions,
      groupId,
      entityId,
      value,
      database,
      permission,
    );
  }

  updatedPermissions = restrictCreateQueriesPermissionsIfNeeded(
    updatedPermissions,
    groupId,
    entityId,
    permission,
    value,
    database,
  );

  updatedPermissions = revokeTransformsPermissionIfNeeded(
    updatedPermissions,
    groupId,
    entityId,
    permission,
    value,
  );

  if (isTableEntityId(entityId)) {
    return inferAndUpdateEntityPermissions(
      updateFieldsPermission(
        updatedPermissions,
        groupId,
        entityId,
        value,
        database,
        permission,
      ),
      groupId,
      entityId,
      database,
      permission,
    );
  }

  if (isSchemaEntityId(entityId)) {
    return updateTablesPermission(
      updatedPermissions,
      groupId,
      entityId,
      value,
      database,
      permission,
    );
  }

  return updateSchemasPermission(
    updatedPermissions,
    groupId,
    entityId,
    value,
    database,
    permission,
  );
}

// utils for dealing with partial graph updates

// select only the parts of the permission graph that contain some kind of edit
// currently only selects values based on some kind of modification happening anywhere
// in the graph for a particular group
export function getModifiedGroupsPermissionsGraphParts(
  dataPermissions: GroupsPermissions,
  originalDataPermissions: GroupsPermissions,
  allGroupIds: string[],
  externallyModifiedGroupIds: string[],
): GroupsPermissions {
  const externallyModifiedGroupIdsSet = new Set(externallyModifiedGroupIds);
  const dataPermissionsModifiedGroups: GroupsPermissions = {};

  for (const groupId of allGroupIds) {
    const groupPermissions = dataPermissions[groupId];

    if (externallyModifiedGroupIdsSet.has(groupId)) {
      if (!_.isEmpty(groupPermissions)) {
        dataPermissionsModifiedGroups[groupId] = groupPermissions;
      }

      continue;
    }

    const originalGroupPermissions = originalDataPermissions[groupId];
    const modifiedDatabasePermissions: GroupsPermissions[string] = {};

    for (const [databaseIdString, value] of Object.entries(
      groupPermissions ?? {},
    )) {
      const databaseId = Number(databaseIdString);

      if (!_.isEqual(value, originalGroupPermissions?.[databaseId])) {
        modifiedDatabasePermissions[databaseId] = value;
      }
    }

    if (!_.isEmpty(modifiedDatabasePermissions)) {
      dataPermissionsModifiedGroups[groupId] = modifiedDatabasePermissions;
    }
  }

  return dataPermissionsModifiedGroups;
}

export function mergeGroupsPermissionsUpdates(
  originalDataPermissions: GroupsPermissions | null | undefined,
  newDataPermissions: GroupsPermissions,
  modifiedGroupIds: string[],
) {
  if (!originalDataPermissions) {
    return newDataPermissions;
  }

  const modifiedGroupIdsSet = new Set(modifiedGroupIds);

  const allGroupIds = _.uniq([
    ...Object.keys(originalDataPermissions),
    ...Object.keys(newDataPermissions),
  ]);

  const latestPermissionsEntries = allGroupIds.map((groupId) => {
    // values can be omitted from the graph to save space or to indicate that the group has default permissions for all entities
    // this means we need to determine the value if we need to use the value currently in memory or default to an empty object
    // which is the FE definition of completely default permissions for all entities
    const defaultValue = modifiedGroupIdsSet.has(groupId)
      ? {}
      : originalDataPermissions[groupId];
    const permissions = newDataPermissions[groupId] ?? defaultValue;
    return [groupId, permissions];
  });

  return Object.fromEntries(latestPermissionsEntries);
}

export function getModifiedCollectionPermissionsGraphParts(
  originalCollectionPermissions: CollectionPermissions,
  collectionPermissions: CollectionPermissions,
) {
  const groupIds = Object.keys(collectionPermissions);
  const modifiedGroupIds = groupIds.filter((groupId) => {
    const originalPerms = originalCollectionPermissions[groupId];
    const currPerms = collectionPermissions[groupId];
    return !_.isEqual(currPerms, originalPerms);
  });
  return _.pick(collectionPermissions, modifiedGroupIds);
}
