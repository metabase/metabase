import { t } from "ttag";
import _ from "underscore";

import {
  isSchemaEntityId,
  isTableEntityId,
} from "metabase/admin/permissions/utils/data-entity-id";
import {
  getFieldsPermission,
  getNativePermission,
  getSchemasPermission,
} from "metabase/admin/permissions/utils/graph";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Group,
  GroupsPermissions,
  ConcreteTableId,
} from "metabase-types/api";

import type { EntityId } from "../types";
import { DataPermission, DataPermissionValue } from "../types";

export const getDefaultGroupHasHigherAccessText = (defaultGroup: Group) =>
  t`The "${defaultGroup.name}" group has a higher level of access than this, which will override this setting. You should limit or revoke the "${defaultGroup.name}" group's access to this item.`;

// these are all the permission levels ordered by level of access
const PERM_LEVELS = [
  "write",
  "read",
  "all",
  DataPermissionValue.IMPERSONATED,
  DataPermissionValue.CONTROLLED,
  DataPermissionValue.NO,
  DataPermissionValue.BLOCKED,
];
function hasGreaterPermissions(
  a: DataPermissionValue,
  b: DataPermissionValue,
  descendingPermissions = PERM_LEVELS,
) {
  // Avoids scenario where the logic of the PERM_LEVELS ordering suggests that
  // a default group permission of "none" would overrule "block".
  if (a === DataPermissionValue.NO && b === DataPermissionValue.BLOCKED) {
    return false;
  } else {
    return (
      descendingPermissions.indexOf(a) - descendingPermissions.indexOf(b) < 0
    );
  }
}

export function getPermissionWarning(
  value: DataPermissionValue,
  defaultGroupValue: DataPermissionValue,
  entityType: string | null,
  defaultGroup: Group,
  groupId: Group["id"],
  descendingPermissions?: string[],
) {
  if (!defaultGroup || groupId === defaultGroup.id) {
    return null;
  }

  if (
    value === DataPermissionValue.CONTROLLED &&
    defaultGroupValue === DataPermissionValue.CONTROLLED
  ) {
    return t`The "${defaultGroup.name}" group may have access to a different set of ${entityType} than this group, which may give this group additional access to some ${entityType}.`;
  }
  if (hasGreaterPermissions(defaultGroupValue, value, descendingPermissions)) {
    return getDefaultGroupHasHigherAccessText(defaultGroup);
  }
  return null;
}

export function getPermissionWarningModal(
  value: DataPermissionValue,
  defaultGroupValue: DataPermissionValue,
  entityType: string | null,
  defaultGroup: Group,
  groupId: Group["id"],
  descendingPermissions?: string[],
) {
  const permissionWarning = getPermissionWarning(
    value,
    defaultGroupValue,
    entityType,
    defaultGroup,
    groupId,
    descendingPermissions,
  );
  if (permissionWarning) {
    return {
      title:
        (value === DataPermissionValue.CONTROLLED ? t`Limit` : t`Revoke`) +
        " " +
        t`access even though "${defaultGroup.name}" has greater access?`,
      message: permissionWarning,
      confirmButtonText:
        value === DataPermissionValue.CONTROLLED
          ? t`Limit access`
          : t`Revoke access`,
      cancelButtonText: t`Cancel`,
    };
  }
}

export function getControlledDatabaseWarningModal(
  currDbPermissionValue: string,
  entityId: EntityId,
) {
  if (currDbPermissionValue !== DataPermissionValue.CONTROLLED) {
    const [entityType, entityTypePlural] = isTableEntityId(entityId)
      ? [t`table`, t`tables`]
      : isSchemaEntityId(entityId)
      ? [t`schema`, t`schemas`]
      : [t`entity`, t`entities`];
    return {
      title: t`Change access to this database to granular?`,
      message: t`Just letting you know that changing the permission setting on this ${entityType} will also update the database permission setting to “Granular” to reflect that some of the database’s ${entityTypePlural} have different permission settings.`,
      confirmButtonText: t`Change`,
      cancelButtonText: t`Cancel`,
    };
  }
}

export function getRawQueryWarningModal(
  permissions: GroupsPermissions,
  groupId: Group["id"],
  entityId: EntityId,
  value: DataPermissionValue,
) {
  const nativePermission = getNativePermission(permissions, groupId, entityId);
  const viewPermission = getSchemasPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  if (
    value === DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    nativePermission !== DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    ![
      DataPermissionValue.UNRESTRICTED,
      DataPermissionValue.IMPERSONATED,
    ].includes(viewPermission)
  ) {
    return {
      title: t`Allow native query editing?`,
      message: t`This will also change this group's data access to Unrestricted for this database.`,
      confirmButtonText: t`Allow`,
      cancelButtonText: t`Cancel`,
    };
  }
}

// If the user is revoking an access to every single table of a database for a specific user group,
// warn the user that the access to raw queries will be revoked as well.
// This warning will only be shown if the user is editing the permissions of individual tables.
export function getRevokingAccessToAllTablesWarningModal(
  database: Database,
  permissions: GroupsPermissions,
  groupId: Group["id"],
  entityId: EntityId,
  value: DataPermissionValue,
) {
  if (
    value === DataPermissionValue.NO &&
    getSchemasPermission(
      permissions,
      groupId,
      entityId,
      DataPermission.VIEW_DATA,
    ) === DataPermissionValue.CONTROLLED &&
    getNativePermission(permissions, groupId, entityId) !==
      DataPermissionValue.NO
  ) {
    // allTableEntityIds contains tables from all schemas
    const allTableEntityIds = database.getTables().map(table => ({
      databaseId: table.db_id,
      schemaName: table.schema_name || "",
      tableId: table.id as ConcreteTableId,
    }));

    // Show the warning only if user tries to revoke access to the very last table of all schemas
    const afterChangesNoAccessToAnyTable = _.every(
      allTableEntityIds,
      id =>
        getFieldsPermission(
          permissions,
          groupId,
          id,
          DataPermission.VIEW_DATA,
        ) === DataPermissionValue.NO || _.isEqual(id, entityId),
    );
    if (afterChangesNoAccessToAnyTable) {
      return {
        title: t`Revoke access to all tables?`,
        message: t`This will also revoke this group's access to raw queries for this database.`,
        confirmButtonText: t`Revoke access`,
        cancelButtonText: t`Cancel`,
      };
    }
  }
}
