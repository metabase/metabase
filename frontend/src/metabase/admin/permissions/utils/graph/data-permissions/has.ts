import _ from "underscore";

import type {
  DataPermission,
  DataPermissionValue,
  DatabaseEntityId,
  EntityWithGroupId,
  SchemaEntityId,
} from "metabase/admin/permissions/types";
import { isSchemaEntityId } from "metabase/admin/permissions/utils/data-entity-id";
import type {
  ConcreteTableId,
  DatabasePermissions,
  GroupPermissions,
  GroupsPermissions,
} from "metabase-types/api";

import {
  getEntityPermission,
  getFieldsPermission,
  getRawPermissionsGraphValue,
  getTablesPermission,
} from "./get";

// subtypes to make testing easier and avoid using deprecated Database / Schema types
type SchemaPartial = {
  name: string;
  getTables: () => { id: number | string }[];
};
type DatabasePartial = {
  schemas?: SchemaPartial[];
  schema(schemaName: string | undefined): SchemaPartial | null | undefined;
};

export function hasPermissionValueInSubgraph(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: DatabaseEntityId | SchemaEntityId,
  database: DatabasePartial,
  permission: DataPermission,
  value: DataPermissionValue,
) {
  const schemasToSearch = _.compact(
    isSchemaEntityId(entityId)
      ? [database.schema(entityId.schemaName)]
      : database.schemas,
  );

  if (schemasToSearch) {
    const hasSchemaWithMatchingPermission = schemasToSearch.some(schema => {
      const currVal = getTablesPermission(
        permissions,
        groupId,
        { databaseId: entityId.databaseId, schemaName: schema.name },
        permission,
      );
      return value === currVal;
    });

    if (hasSchemaWithMatchingPermission) {
      return true;
    }
  }

  return schemasToSearch.some(schema => {
    return schema.getTables().some(table => {
      return (
        value ===
        getFieldsPermission(
          permissions,
          groupId,
          {
            databaseId: entityId.databaseId,
            schemaName: schema.name,
            tableId: table.id as ConcreteTableId,
          },
          permission,
        )
      );
    });
  });
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
