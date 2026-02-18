import { getIn } from "icepick";

import type {
  DatabaseEntityId,
  EntityId,
  SchemaEntityId,
  TableEntityId,
} from "metabase/admin/permissions/types";
import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import type { GroupsPermissions } from "metabase-types/api";

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
};

function getOmittedPermissionValue(
  permission: DataPermission,
): DataPermissionValue {
  return omittedDefaultValues[permission] ?? DataPermissionValue.NO;
}

// returns portion of the graph that might be undefined,
// purposefully does not try to determine the entity's value from its parent
export function getRawPermissionsGraphValue(
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
