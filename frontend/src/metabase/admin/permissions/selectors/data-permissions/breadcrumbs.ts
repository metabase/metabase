import { t } from "ttag";

import { hasDbRoutingEnabled } from "metabase/common/utils/database";
import { isNotFalsy } from "metabase/utils/types";
import type { Group, PermissionsDatabase } from "metabase-types/api";

import type {
  DataRouteParams,
  GroupRouteParams,
  PermissionEditorBreadcrumb,
} from "../../types";
import {
  getDatabaseEntityId,
  getSchemaEntityId,
} from "../../utils/data-entity-id";
import { getDatabaseSchema, getDatabaseSchemas } from "../../utils/metadata";
import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "../../utils/urls";

export const getDatabasesEditorBreadcrumbs = (
  params: GroupRouteParams,
  database: PermissionsDatabase | undefined,
  group: Group,
): PermissionEditorBreadcrumb[] | null => {
  const { groupId, databaseId, schemaName } = params;

  if (groupId == null) {
    return null;
  }

  const groupItem = {
    id: group.id,
    text: `${group.name} group`,
    url: getGroupFocusPermissionsUrl(group.id),
  };

  if (databaseId == null || database == null) {
    return [groupItem];
  }

  const databaseItem = {
    id: database.id,
    text: database.name,
    subtext: hasDbRoutingEnabled(database)
      ? t`(Database routing enabled)`
      : undefined,
    url: getGroupFocusPermissionsUrl(group.id, getDatabaseEntityId(database)),
  };

  if (schemaName == null) {
    return [groupItem, databaseItem];
  }

  const schema = getDatabaseSchema(database, schemaName);

  if (schema == null) {
    return [groupItem, databaseItem];
  }

  const schemaItem = {
    id: schema.name,
    text: schema.name,
  };
  return [groupItem, databaseItem, schemaItem];
};

export const getGroupsDataEditorBreadcrumbs = (
  params: DataRouteParams,
  database: PermissionsDatabase | undefined,
): PermissionEditorBreadcrumb[] | null => {
  const { databaseId, schemaName, tableId } = params;

  if (databaseId == null || database == null) {
    return null;
  }

  const databaseItem = {
    text: database.name,
    subtext: hasDbRoutingEnabled(database)
      ? t`(Database routing enabled)`
      : undefined,
    id: databaseId,
    url: getDatabaseFocusPermissionsUrl(getDatabaseEntityId(database)),
  };

  const schema = getDatabaseSchema(database, schemaName);

  if ((schemaName == null && tableId == null) || schema == null) {
    return [databaseItem];
  }

  const schemaItem = {
    id: schema.id,
    text: schema.name,
    url: getDatabaseFocusPermissionsUrl(getSchemaEntityId(schema)),
  };

  const hasMultipleSchemas = getDatabaseSchemas(database).length > 1;

  if (tableId == null) {
    return [databaseItem, hasMultipleSchemas && schemaItem].filter(isNotFalsy);
  }

  const table = database.tables?.find(
    ({ id }) => String(id) === String(tableId),
  );

  if (table == null) {
    return [databaseItem, hasMultipleSchemas && schemaItem].filter(isNotFalsy);
  }

  const tableItem = {
    id: table.id,
    text: table.display_name,
  };

  return [databaseItem, hasMultipleSchemas && schemaItem, tableItem].filter(
    isNotFalsy,
  );
};
