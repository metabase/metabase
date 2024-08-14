import { t, c } from "ttag";
import _ from "underscore";

import {
  isSchemaEntityId,
  isTableEntityId,
} from "metabase/admin/permissions/utils/data-entity-id";
import {
  getFieldsPermission,
  getSchemasPermission,
} from "metabase/admin/permissions/utils/graph";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
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
  DataPermissionValue.ALL,
  DataPermissionValue.YES,
  DataPermissionValue.UNRESTRICTED,
  DataPermissionValue.FULL,
  DataPermissionValue.IMPERSONATED,
  DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
  DataPermissionValue.QUERY_BUILDER,
  DataPermissionValue.CONTROLLED,
  DataPermissionValue.SANDBOXED,
  DataPermissionValue.BLOCKED,
  DataPermissionValue.LEGACY_NO_SELF_SERVICE,
  DataPermissionValue.LIMITED,
  DataPermissionValue.NO,
  DataPermissionValue.NONE,
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
  descendingPermissions?: DataPermissionValue[],
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

  if (value === DataPermissionValue.LEGACY_NO_SELF_SERVICE) {
    return t`In a future release, if a group's View data access for a database (or any of its schemas or tables) is still set to No self-service (Deprecated), Metabase will automatically change that group's View data access for the entire database to Blocked. We'll be defaulting to Blocked, the least permissive View data access, to prevent any unintended access to data.`;
  }

  if (hasGreaterPermissions(defaultGroupValue, value, descendingPermissions)) {
    return getDefaultGroupHasHigherAccessText(defaultGroup);
  }

  return null;
}

function getEntityTypeFromId(entityId: EntityId): [string, string] {
  return isTableEntityId(entityId)
    ? [t`table`, t`tables`]
    : isSchemaEntityId(entityId)
    ? [t`schema`, t`schemas`]
    : [t`entity`, t`entities`];
}

export function getPermissionWarningModal(
  value: DataPermissionValue,
  defaultGroupValue: DataPermissionValue,
  entityType: string | null,
  defaultGroup: Group,
  groupId: Group["id"],
  descendingPermissions?: DataPermissionValue[],
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

export function getWillRevokeNativeAccessWarningModal(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
) {
  // if the db is set to query builder and native for this group
  // then warn the user that the change will downgrade native permissions
  const currDbCreateQueriesPermission = getSchemasPermission(
    permissions,
    groupId,
    { databaseId: entityId.databaseId },
    DataPermission.CREATE_QUERIES,
  );

  if (
    currDbCreateQueriesPermission ===
    DataPermissionValue.QUERY_BUILDER_AND_NATIVE
  ) {
    const [entityType] = getEntityTypeFromId(entityId);

    return {
      title: t`Change access to this database to “Granular”?`,
      message: t`As part of providing granular permissions for this one ${entityType}, this group's native querying permissions will also be removed from all tables and schemas in this database.`,
      confirmButtonText: c("This is a verb, for a confirmation button")
        .t`Change`,
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
  const nativePermission = getSchemasPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.CREATE_QUERIES,
  );

  const viewPermission = getSchemasPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  if (
    value === DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    nativePermission !== DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn &&
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
    getSchemasPermission(
      permissions,
      groupId,
      entityId,
      DataPermission.CREATE_QUERIES,
    ) !== DataPermissionValue.NO
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
