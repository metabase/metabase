import { Metadata } from "metabase-types/types/Metadata";
import { Group } from "metabase-types/types/Permissions";
import _ from "underscore";

import {
  getSchemaEntityId,
  getDatabaseEntityId,
} from "../../utils/data-entity-id";
import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "../../utils/urls";
import { DataRouteParams } from "../types";

export const getDatabasesEditorBreadcrumbs = (
  params: DataRouteParams,
  metadata: Metadata,
  group: Group,
) => {
  const { groupId, databaseId, schemaName } = params;

  if (groupId == null) {
    return null;
  }

  const groupItem = {
    id: group.id,
    text: `${group.name} group`,
    url: getGroupFocusPermissionsUrl(group.id),
  };

  if (databaseId == null) {
    return [groupItem];
  }

  const database = metadata.database(databaseId);
  const databaseItem = {
    id: database.id,
    text: database.name,
    url: getGroupFocusPermissionsUrl(group.id, getDatabaseEntityId(database)),
  };

  if (schemaName == null) {
    return [groupItem, databaseItem];
  }

  const schema = database.schema(schemaName);
  const schemaItem = {
    id: schema.name,
    text: schema.name,
  };
  return [groupItem, databaseItem, schemaItem];
};

export const getGroupsDataEditorBreadcrumbs = (params, metadata) => {
  const { databaseId, schemaName, tableId } = params;

  if (databaseId == null) {
    return null;
  }

  const database = metadata.database(databaseId);

  const databaseItem = {
    text: database.name,
    id: databaseId,
    url: getDatabaseFocusPermissionsUrl(getDatabaseEntityId(database)),
  };

  if (
    (schemaName == null && tableId == null) ||
    database.schema(schemaName) == null
  ) {
    return [databaseItem];
  }

  const schema = database.schema(schemaName);
  const schemaItem = {
    id: schema.id,
    text: schema.name,
    url: getDatabaseFocusPermissionsUrl(getSchemaEntityId(schema)),
  };

  const hasMultipleSchemas = database.schemasCount() > 1;

  if (tableId == null) {
    return [databaseItem, hasMultipleSchemas && schemaItem].filter(Boolean);
  }

  const table = metadata.table(tableId);

  const tableItem = {
    id: table.id,
    text: table.display_name,
  };

  return [databaseItem, hasMultipleSchemas && schemaItem, tableItem].filter(
    Boolean,
  );
};
