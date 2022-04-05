import { t } from "ttag";
import _ from "underscore";

import {
  getFieldsPermission,
  getNativePermission,
  getSchemasPermission,
} from "metabase/admin/permissions/utils/graph";

// these are all the permission levels ordered by level of access
const PERM_LEVELS = ["write", "read", "all", "controlled", "none", "block"];
function hasGreaterPermissions(a, b) {
  return PERM_LEVELS.indexOf(a) - PERM_LEVELS.indexOf(b) < 0;
}

export function getPermissionWarning(
  value,
  defaultGroupValue,
  entityType,
  defaultGroup,
  groupId,
) {
  if (!defaultGroup || groupId === defaultGroup.id) {
    return null;
  }

  if (value === "controlled" && defaultGroupValue === "controlled") {
    return t`The "${defaultGroup.name}" group may have access to a different set of ${entityType} than this group, which may give this group additional access to some ${entityType}.`;
  }
  if (hasGreaterPermissions(defaultGroupValue, value)) {
    return t`The "${defaultGroup.name}" group has a higher level of access than this, which will override this setting. You should limit or revoke the "${defaultGroup.name}" group's access to this item.`;
  }
  return null;
}

export function getPermissionWarningModal(
  value,
  defaultGroupValue,
  entityType,
  defaultGroup,
  groupId,
) {
  const permissionWarning = getPermissionWarning(
    value,
    defaultGroupValue,
    entityType,
    defaultGroup,
    groupId,
  );
  if (permissionWarning) {
    return {
      title:
        (value === "controlled" ? t`Limit` : t`Revoke`) +
        " " +
        t`access even though "${defaultGroup.name}" has greater access?`,
      message: permissionWarning,
      confirmButtonText:
        value === "controlled" ? t`Limit access` : t`Revoke access`,
      cancelButtonText: t`Cancel`,
    };
  }
}

export function getControlledDatabaseWarningModal(
  permissions,
  groupId,
  entityId,
) {
  if (
    getSchemasPermission(permissions, groupId, entityId, "data") !==
    "controlled"
  ) {
    return {
      title: t`Change access to this database to limited?`,
      confirmButtonText: t`Change`,
      cancelButtonText: t`Cancel`,
    };
  }
}

export function getRawQueryWarningModal(permissions, groupId, entityId, value) {
  if (
    value === "write" &&
    getNativePermission(permissions, groupId, entityId) !== "write" &&
    getSchemasPermission(permissions, groupId, entityId, "data") !== "all"
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
  database,
  permissions,
  groupId,
  entityId,
  value,
) {
  if (
    value === "none" &&
    getSchemasPermission(permissions, groupId, entityId, "data") ===
      "controlled" &&
    getNativePermission(permissions, groupId, entityId) !== "none"
  ) {
    // allTableEntityIds contains tables from all schemas
    const allTableEntityIds = database.tables.map(table => ({
      databaseId: table.db_id,
      schemaName: table.schema_name || "",
      tableId: table.id,
    }));

    // Show the warning only if user tries to revoke access to the very last table of all schemas
    const afterChangesNoAccessToAnyTable = _.every(
      allTableEntityIds,
      id =>
        getFieldsPermission(permissions, groupId, id) === "none" ||
        _.isEqual(id, entityId),
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
