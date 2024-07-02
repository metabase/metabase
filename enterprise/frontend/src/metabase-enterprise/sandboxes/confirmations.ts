import { t } from "ttag";

import {
  DataPermissionValue,
  type EntityId,
} from "metabase/admin/permissions/types";
import { hasPermissionValueInGraph } from "metabase/admin/permissions/utils/graph";
import type { GroupsPermissions } from "metabase-types/api/permissions";

export function getSandboxedTableWarningModal(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  value: DataPermissionValue,
) {
  // if the user is sandboxing the table while there is create-queries permissions set to
  // query builder and native for that group's access to the database being modified, we
  // should prompt them that we will have to remove native access for all tables/schemas
  if (
    value === DataPermissionValue.SANDBOXED &&
    hasPermissionValueInGraph(
      permissions[groupId][entityId.databaseId],
      DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
    )
  ) {
    return {
      title: t`Change access to this database to “Sandboxed”?`,
      message: t`This group's native querying permissions will be removed from all tables and schemas in this database.`,
      confirmButtonText: t`Change`,
      cancelButtonText: t`Cancel`,
    };
  }
}
