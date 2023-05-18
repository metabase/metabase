import { t } from "ttag";
import _ from "underscore";

import {
  getFieldsPermission,
  getNativePermission,
  getSchemasPermission,
} from "metabase/admin/permissions/utils/graph";
import type {
  Group,
  GroupsPermissions,
  ConcreteTableId,
} from "metabase-types/api";
import type Database from "metabase-lib/metadata/Database";
import type { EntityId } from "../types";

export const getDefaultGroupHasHigherAccessText = (defaultGroup: Group) =>
  t`The "${defaultGroup.name}" group has a higher level of access than this, which will override this setting. You should limit or revoke the "${defaultGroup.name}" group's access to this item.`;

// these are all the permission levels ordered by level of access
const PERM_LEVELS = ["write", "read", "all", "controlled", "none", "block"];
function hasGreaterPermissions(
  a: string,
  b: string,
  descendingPermissions = PERM_LEVELS,
) {
  // Avoids scenario where the logic of the PERM_LEVELS ordering suggests that
  // a default group permission of "none" would overrule "block".
  if (a === "none" && b === "block") {
    return false;
  } else {
    return (
      descendingPermissions.indexOf(a) - descendingPermissions.indexOf(b) < 0
    );
  }
}

export function getPermissionWarning(
  value: string,
  defaultGroupValue: string,
  entityType: string | null,
  defaultGroup: Group,
  groupId: Group["id"],
  descendingPermissions?: string[],
) {
  if (!defaultGroup || groupId === defaultGroup.id) {
    return null;
  }

  if (value === "controlled" && defaultGroupValue === "controlled") {
    return t`The "${defaultGroup.name}" group may have access to a different set of ${entityType} than this group, which may give this group additional access to some ${entityType}.`;
  }
  if (hasGreaterPermissions(defaultGroupValue, value, descendingPermissions)) {
    return getDefaultGroupHasHigherAccessText(defaultGroup);
  }
  return null;
}

export function getPermissionWarningModal(
  value: string,
  defaultGroupValue: string,
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
  permissions: GroupsPermissions,
  groupId: Group["id"],
  entityId: EntityId,
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

export function getRawQueryWarningModal(
  permissions: GroupsPermissions,
  groupId: Group["id"],
  entityId: EntityId,
  value: string,
) {
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
  database: Database,
  permissions: GroupsPermissions,
  groupId: Group["id"],
  entityId: EntityId,
  value: string,
) {
  if (
    value === "none" &&
    getSchemasPermission(permissions, groupId, entityId, "data") ===
      "controlled" &&
    getNativePermission(permissions, groupId, entityId) !== "none"
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
        getFieldsPermission(permissions, groupId, id, "data") === "none" ||
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
