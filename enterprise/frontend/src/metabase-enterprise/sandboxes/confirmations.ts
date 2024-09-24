import { t } from "ttag";

import {
  DataPermission,
  DataPermissionValue,
  type EntityId,
} from "metabase/admin/permissions/types";
import { getEntityPermission } from "metabase/admin/permissions/utils/graph";
import type { GroupsPermissions } from "metabase-types/api/permissions";

export function getSandboxedTableWarningModal(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  value: DataPermissionValue,
) {
  const createQueriesPermissions = getEntityPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.CREATE_QUERIES,
  );

  // warn we will remove native query access if user is sandboxing a table
  if (
    value === DataPermissionValue.SANDBOXED &&
    createQueriesPermissions === DataPermissionValue.QUERY_BUILDER_AND_NATIVE
  ) {
    return {
      title: t`Change access to this database to “Sandboxed”?`,
      message: t`This group's native querying permissions will be removed from this table.`,
      confirmButtonText: t`Change`,
      cancelButtonText: t`Cancel`,
    };
  }

  const viewDataPermissions = getEntityPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  // warn we will remove sandboxing if user gives native query access
  if (
    value === DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    viewDataPermissions === DataPermissionValue.SANDBOXED
  ) {
    return {
      title: t`Remove “Sandboxed” access from this table?`,
      message: t`Giving this group native querying permissions will remove sandboxing and grant “Can view” View data access.`,
      confirmButtonText: t`Change`,
      cancelButtonText: t`Cancel`,
    };
  }
}
