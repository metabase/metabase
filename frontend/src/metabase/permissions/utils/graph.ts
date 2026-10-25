import { getIn } from "icepick";
import _ from "underscore";

import {
  type DatabaseEntityId,
  type EntityWithGroupId,
  PLUGIN_ADVANCED_PERMISSIONS,
  type PermissionEntityId,
  type PermissionsDatabase,
  type SchemaEntityId,
  type TableEntityId,
} from "metabase/plugins";
import {
  DataPermission,
  DataPermissionValue,
  type DatabasePermissions,
  type GroupPermissions,
  type GroupsPermissions,
} from "metabase-types/api";

import { isSchemaEntityId, tableToTableEntityId } from "./entity-ids";
import { getDatabaseSchema, getDatabaseSchemas } from "./metadata";

export const isRestrictivePermission = (value: DataPermissionValue) =>
  value === DataPermissionValue.NO ||
  PLUGIN_ADVANCED_PERMISSIONS.isRestrictivePermission(value);

// permission that do not have a nested schemas/native key
const flatPermissions = new Set([
  DataPermission.DETAILS,
  DataPermission.VIEW_DATA,
  DataPermission.CREATE_QUERIES,
  DataPermission.TRANSFORMS,
]);

// util to ease migration of perms attributes into a flatter structure
export function getPermissionPath(
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
  [DataPermission.TRANSFORMS]: DataPermissionValue.NO,
  [DataPermission.COLLECTIONS]: DataPermissionValue.NONE,
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
  entityId: PermissionEntityId,
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

export const getEntityPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  entityId: PermissionEntityId,
  permission: DataPermission,
): DataPermissionValue => {
  if (entityId.tableId !== undefined) {
    return getFieldsPermission(
      permissions,
      groupId,
      // Unjustified type cast. FIXME
      entityId as TableEntityId,
      permission,
    );
  } else if (entityId.schemaName !== undefined) {
    return getTablesPermission(
      permissions,
      groupId,
      // Unjustified type cast. FIXME
      entityId as SchemaEntityId,
      permission,
    );
  } else {
    return getSchemasPermission(permissions, groupId, entityId, permission);
  }
};

export function hasPermissionValueInSubgraph(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: DatabaseEntityId | SchemaEntityId,
  database: PermissionsDatabase,
  permission: DataPermission,
  value: DataPermissionValue,
) {
  const schemasToSearch = _.compact(
    isSchemaEntityId(entityId)
      ? [getDatabaseSchema(database, entityId.schemaName)]
      : getDatabaseSchemas(database),
  );

  return schemasToSearch.some(
    (schema) =>
      getTablesPermission(
        permissions,
        groupId,
        { databaseId: entityId.databaseId, schemaName: schema.name },
        permission,
      ) === value ||
      schema.tables.some(
        (table) =>
          getFieldsPermission(
            permissions,
            groupId,
            { ...tableToTableEntityId(table), databaseId: entityId.databaseId },
            permission,
          ) === value,
      ),
  );
}

// return boolean if able to find if a value is present in all or a portion of the permissions graph
// NOTE: default values are omitted from the graph, and given the way this function was written, it won't return
// the right answer for those permissions. for now, those default values have been omitted from allowed values to avoid bugs
export function hasPermissionValueInGraph(
  permissions:
    | GroupsPermissions
    | GroupPermissions
    | DatabasePermissions
    | DataPermissionValue,
  permissionValue: Omit<
    DataPermissionValue,
    DataPermissionValue.BLOCKED | DataPermissionValue.NO // omit default values
  >,
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
  return entityIds.some((entityId) => {
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
