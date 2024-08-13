import { getIn, setIn } from "icepick";
import _ from "underscore";

import {
  PLUGIN_DATA_PERMISSIONS,
  PLUGIN_ADVANCED_PERMISSIONS,
} from "metabase/plugins";
import type Database from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import type {
  GroupsPermissions,
  GroupPermissions,
  DatabasePermissions,
  ConcreteTableId,
} from "metabase-types/api";

import type {
  DatabaseEntityId,
  EntityId,
  EntityWithGroupId,
  SchemaEntityId,
  TableEntityId,
} from "../../types";
import { DataPermission, DataPermissionValue } from "../../types";

export const isRestrictivePermission = (value: DataPermissionValue) =>
  value === DataPermissionValue.NO ||
  PLUGIN_ADVANCED_PERMISSIONS.isRestrictivePermission(value);

// permission that do not have a nested shemas/native key
const flatPermissions = new Set([
  DataPermission.DETAILS,
  DataPermission.VIEW_DATA,
  DataPermission.CREATE_QUERIES,
]);

// util to ease migration of perms attributes into a flatter structure
function getPermissionPath(
  groupId: number,
  databaseId: number,
  permission: DataPermission,
  nestedPath?: Array<string | number>,
) {
  const isFlatPermValue = flatPermissions.has(permission);
  if (isFlatPermValue) {
    return [groupId, databaseId, permission, ...(nestedPath || [])];
  }
  return [groupId, databaseId, permission, "schemas", ...(nestedPath || [])];
}

const omittedDefaultValues: Record<DataPermission, DataPermissionValue> = {
  get [DataPermission.VIEW_DATA]() {
    return PLUGIN_ADVANCED_PERMISSIONS.defaultViewDataPermission;
  },
  [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
  [DataPermission.DOWNLOAD]: DataPermissionValue.NONE,
  [DataPermission.DATA_MODEL]: DataPermissionValue.NONE,
  [DataPermission.DETAILS]: DataPermissionValue.NO,
};

function getOmittedPermissionValue(
  permission: DataPermission,
): DataPermissionValue {
  return omittedDefaultValues[permission] ?? DataPermissionValue.NO;
}

// returns portion of the graph that might be undefined,
// purposefully does not try to determine the entity's value from its parent
function getRawPermissionsGraphValue(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  permission: DataPermission,
) {
  const nestedPath = [
    entityId.schemaName === null ? "" : entityId.schemaName,
    entityId.tableId,
  ].filter((x): x is number | string => x !== undefined);
  const path = getPermissionPath(
    groupId,
    entityId.databaseId,
    permission,
    nestedPath,
  );
  return getIn(permissions, path);
}

interface GetPermissionParams {
  permissions: GroupsPermissions;
  groupId: number;
  databaseId: number;
  permission: DataPermission;
  path?: Array<number | string>;
  isControlledType?: boolean;
}

const getPermission = ({
  permissions,
  groupId,
  databaseId,
  permission,
  path,
  isControlledType = false,
}: GetPermissionParams): DataPermissionValue => {
  const valuePath = getPermissionPath(groupId, databaseId, permission, path);
  const value = getIn(permissions, valuePath);
  if (isControlledType && typeof value === "object") {
    return DataPermissionValue.CONTROLLED;
  }
  return value ? value : getOmittedPermissionValue(permission);
};

export function updatePermission(
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

export const getSchemasPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  permission: DataPermission,
) => {
  return getPermission({
    permissions,
    databaseId,
    groupId,
    permission,
    isControlledType: true,
  });
};

export const getTablesPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId, schemaName }: SchemaEntityId,
  permission: DataPermission,
) => {
  const schemas = getSchemasPermission(
    permissions,
    groupId,
    {
      databaseId,
    },
    permission,
  );
  if (schemas === DataPermissionValue.CONTROLLED) {
    return getPermission({
      permissions,
      databaseId,
      groupId,
      permission,
      path: [schemaName ?? ""],
      isControlledType: true,
    });
  } else {
    return schemas;
  }
};

export const getFieldsPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId, schemaName, tableId }: TableEntityId,
  permission: DataPermission,
): DataPermissionValue => {
  const tables = getTablesPermission(
    permissions,
    groupId,
    {
      databaseId,
      schemaName,
    },
    permission,
  );
  if (tables === DataPermissionValue.CONTROLLED) {
    return getPermission({
      permissions,
      groupId,
      databaseId,
      permission,
      path: [schemaName || "", tableId],
      isControlledType: true,
    });
  } else {
    return tables;
  }
};

const getEntityPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  permission: DataPermission,
): DataPermissionValue => {
  if (entityId.tableId !== undefined) {
    return getFieldsPermission(
      permissions,
      groupId,
      entityId as TableEntityId,
      permission,
    );
  } else if (entityId.schemaName !== undefined) {
    return getTablesPermission(
      permissions,
      groupId,
      entityId as SchemaEntityId,
      permission,
    );
  } else {
    return getSchemasPermission(permissions, groupId, entityId, permission);
  }
};

// return boolean if able to find if a value is present in all or a portion of the permissions graph
export function hasPermissionValueInGraph(
  permissions:
    | GroupsPermissions
    | GroupPermissions
    | DatabasePermissions
    | DataPermissionValue,
  permissionValue: DataPermissionValue,
): boolean {
  if (permissions === permissionValue) {
    return true;
  }

  function _hasPermissionValueInGraph(permissionsGraphSection: any) {
    for (const key in permissionsGraphSection) {
      const isMatch = permissionsGraphSection[key] === permissionValue;
      if (isMatch) {
        return true;
      }

      const isGraphObjWithMatch =
        typeof permissionsGraphSection[key] === "object" &&
        _hasPermissionValueInGraph(permissionsGraphSection[key]);
      if (isGraphObjWithMatch) {
        return true;
      }
    }

    return false;
  }

  return _hasPermissionValueInGraph(permissions);
}

// return boolean if able to find if a value is present in any of the specified portions of the graph
// useful for ignoring certain parts of the graphy you don't care to check
export function hasPermissionValueInEntityGraphs(
  permissions: GroupsPermissions,
  entityIds: EntityWithGroupId[],
  permission: DataPermission,
  permissionValue: DataPermissionValue,
): boolean {
  return entityIds.some(entityId => {
    // try to get the raw section of the graph so we can crawl it's children if it has them
    const permissionPortion = getRawPermissionsGraphValue(
      permissions,
      entityId.groupId,
      entityId,
      permission,
    );

    if (permissionPortion !== undefined) {
      return hasPermissionValueInGraph(permissionPortion, permissionValue);
    }

    // the above may be undefined since the entity's value is determined from a parent entity in the graph,
    // so we figure that out here and check if it matches what we're looking for
    const entityPermission = getEntityPermission(
      permissions,
      entityId.groupId,
      entityId,
      permission,
    );
    return entityPermission === permissionValue;
  });
}

// Ideally this would live in downgradeNativePermissionsIfNeeded, but originally that function was
// created to only be called if a view permission was changing. there needs to be some reworking
// in some of the setter methods to make sure the downgrading will always happen at the appropriate time
export function restrictNativeQueryPermissionsIfNeeded(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  permission: DataPermission,
  value: DataPermissionValue,
  database: Database,
) {
  const currDbNativePermission = getSchemasPermission(
    permissions,
    groupId,
    { databaseId: entityId.databaseId },
    DataPermission.CREATE_QUERIES,
  );

  const isMakingGranularCreateQueriesChange =
    permission === DataPermission.CREATE_QUERIES &&
    value !== DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    (entityId.tableId != null || entityId.schemaName != null) &&
    currDbNativePermission === DataPermissionValue.QUERY_BUILDER_AND_NATIVE;

  const shouldDowngradeNative =
    isMakingGranularCreateQueriesChange ||
    PLUGIN_DATA_PERMISSIONS.shouldRestrictNativeQueryPermissions(
      permissions,
      groupId,
      entityId,
      permission,
      value,
      database,
    );

  if (shouldDowngradeNative) {
    const schemaNames = (database && database.schemaNames()) ?? [null];

    schemaNames.forEach(schemaName => {
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

  return permissions;
}

export function downgradeNativePermissionsIfNeeded(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  value: DataPermissionValue,
) {
  // remove query creation permissions if view permission is getting restricted
  if (
    isRestrictivePermission(value) ||
    value === DataPermissionValue.LEGACY_NO_SELF_SERVICE
  ) {
    return updatePermission(
      permissions,
      groupId,
      databaseId,
      DataPermission.CREATE_QUERIES,
      [],
      DataPermissionValue.NO,
    );
  } else {
    return permissions;
  }
}

const metadataTableToTableEntityId = (table: Table) => ({
  databaseId: table.db_id,
  schemaName: table.schema_name || "",
  tableId: table.id as ConcreteTableId,
});

// TODO Atte Keinänen 6/24/17 See if this method could be simplified
const entityIdToMetadataTableFields = (entityId: Partial<TableEntityId>) => ({
  ...(entityId.databaseId ? { db_id: entityId.databaseId } : {}),
  // Because schema name can be an empty string, which means an empty schema, this check becomes a little nasty
  ...(entityId.schemaName !== undefined
    ? { schema_name: entityId.schemaName !== "" ? entityId.schemaName : null }
    : {}),
  ...(entityId.tableId ? { id: entityId.tableId } : {}),
});

function inferEntityPermissionValueFromChildTables(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  database: Database,
  permission: DataPermission,
): DataPermissionValue {
  const entityIdsForDescendantTables = _.chain(database.tables)
    .filter(t => _.isMatch(t, entityIdToMetadataTableFields(entityId)))
    .map(metadataTableToTableEntityId)
    .value();

  const entityIdsByPermValue = _.chain(entityIdsForDescendantTables)
    .map(id => getFieldsPermission(permissions, groupId, id, permission))
    .groupBy(_.identity)
    .value();

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
export function inferAndUpdateEntityPermissions(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  database: Database,
  permission: DataPermission,
  downgradeNative?: boolean,
) {
  const { databaseId } = entityId;
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
      downgradeNative,
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
      downgradeNative,
    );

    if (downgradeNative) {
      permissions = downgradeNativePermissionsIfNeeded(
        permissions,
        groupId,
        { databaseId },
        schemasPermissionValue,
      );
    }
  }

  return permissions;
}

export function updateFieldsPermission(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: TableEntityId,
  value: any,
  database: Database,
  permission: DataPermission,
  downgradeNative?: boolean,
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
    downgradeNative,
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

export function updateTablesPermission(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId, schemaName }: SchemaEntityId,
  value: any,
  database: Database,
  permission: DataPermission,
  downgradeNative?: boolean,
) {
  const schema = database.schema(schemaName);
  const tableIds = schema?.getTables().map((t: Table) => t.id);

  permissions = updateSchemasPermission(
    permissions,
    groupId,
    { databaseId },
    DataPermissionValue.CONTROLLED,
    database,
    permission,
    downgradeNative,
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

export function updateSchemasPermission(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  value: DataPermissionValue,
  database: Database,
  permission: DataPermission,
  downgradeNative?: boolean,
) {
  const schemaNames = database && database.schemaNames();
  const schemaNamesOrNoSchema =
    schemaNames &&
    schemaNames.length > 0 &&
    !(schemaNames.length === 1 && schemaNames[0] === null)
      ? schemaNames
      : [""];

  if (downgradeNative) {
    permissions = downgradeNativePermissionsIfNeeded(
      permissions,
      groupId,
      { databaseId },
      value,
    );
  }

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
