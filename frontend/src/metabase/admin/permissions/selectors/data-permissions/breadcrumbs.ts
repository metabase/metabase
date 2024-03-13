import { isNotFalsy } from "metabase/lib/types";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type Table from "metabase-lib/v1/metadata/Table";
import type { Group } from "metabase-types/api";

import type { DataRouteParams, GroupRouteParams } from "../../types";
import {
  getSchemaEntityId,
  getDatabaseEntityId,
} from "../../utils/data-entity-id";
import { getDatabase } from "../../utils/metadata";
import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "../../utils/urls";

export type EditorBreadcrumb = {
  id?: number | string;
  text: string;
  url?: string;
};

export const getDatabasesEditorBreadcrumbs = (
  params: GroupRouteParams,
  metadata: Metadata,
  group: Group,
): EditorBreadcrumb[] | null => {
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

  const database = getDatabase(metadata, databaseId);

  const databaseItem = {
    id: database.id,
    text: database.name,
    url: getGroupFocusPermissionsUrl(group.id, getDatabaseEntityId(database)),
  };

  if (schemaName == null) {
    return [groupItem, databaseItem];
  }

  const schema = database.schema(schemaName) as Schema;
  const schemaItem = {
    id: schema.name,
    text: schema.name,
  };
  return [groupItem, databaseItem, schemaItem];
};

export const getGroupsDataEditorBreadcrumbs = (
  params: DataRouteParams,
  metadata: Metadata,
): EditorBreadcrumb[] | null => {
  const { databaseId, schemaName, tableId } = params;

  if (databaseId == null) {
    return null;
  }

  const database = getDatabase(metadata, databaseId);

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

  const schema = database.schema(schemaName) as Schema;
  const schemaItem = {
    id: schema.id,
    text: schema.name,
    url: getDatabaseFocusPermissionsUrl(getSchemaEntityId(schema)),
  };

  const hasMultipleSchemas = database.schemasCount() > 1;

  if (tableId == null) {
    return [databaseItem, hasMultipleSchemas && schemaItem].filter(isNotFalsy);
  }

  const table = metadata.table(tableId) as Table;

  const tableItem = {
    id: table.id,
    text: table.display_name,
  };

  return [databaseItem, hasMultipleSchemas && schemaItem, tableItem].filter(
    isNotFalsy,
  );
};
