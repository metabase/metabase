import { t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { PLUGIN_AUDIT } from "metabase/plugins";
import type {
  Database,
  PermissionEntityId,
  PermissionsDatabase,
} from "metabase-types/api";

import type { RawDataRouteParams } from "../../types";
import {
  getDatabaseEntityId,
  getSchemaEntityId,
  getTableEntityId,
} from "../../utils/data-entity-id";
import { getDatabaseSchemas } from "../../utils/metadata";

export type DataTreeNodeItem = {
  entityId: PermissionEntityId;
  children?: DataTreeNodeItem[];
} & ITreeNodeItem;

export type DataSidebarProps = {
  entityGroups: DataTreeNodeItem[][];
  selectedId?: string;
  filterPlaceholder: string;
};

// Schema names repeat across databases (every Postgres has `public`), so a
// schema's node id carries its database. Table ids are already unique.
const getDatabaseNodeId = (databaseId: Database["id"] | string) =>
  `database:${databaseId}`;
const getSchemaNodeId = (databaseId: Database["id"] | string, name: string) =>
  `schema:${databaseId}:${name}`;
const getTableNodeId = (id: string | number) => `table:${id}`;

/** Databases the permissions editor can be focused on. */
export const getSidebarDatabases = (databases: PermissionsDatabase[]) =>
  databases.filter(
    (db) =>
      !db.is_saved_questions &&
      !PLUGIN_AUDIT.isAuditDb(db) &&
      !db.router_database_id,
  );

const getTableNodes = (
  tables: NonNullable<Database["tables"]>,
): DataTreeNodeItem[] =>
  tables
    .toSorted((a, b) => a.display_name.localeCompare(b.display_name))
    .map((table) => ({
      id: getTableNodeId(table.id),
      entityId: getTableEntityId(table),
      name: table.display_name,
      icon: "table" as const,
    }));

/**
 * A database's schemas and tables, or just its tables when it has a single
 * schema. Empty until the database's tables have loaded.
 */
const getDatabaseChildren = (
  database: PermissionsDatabase,
): DataTreeNodeItem[] => {
  const schemas = getDatabaseSchemas(database);

  if (schemas.length === 1) {
    return getTableNodes(schemas[0].tables);
  }

  return schemas
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((schema) => ({
      id: getSchemaNodeId(database.id, schema.name),
      name: schema.name,
      entityId: getSchemaEntityId(schema),
      icon: "folder" as const,
      children: getTableNodes(schema.tables),
    }));
};

/**
 * Every database as an expandable tree, the way the collections sidebar works:
 * selecting a database, schema, or table focuses the editor on that level.
 */
export const getDatabasesTreeSidebar = (
  databases: PermissionsDatabase[],
  { databaseId, schemaName, tableId }: RawDataRouteParams,
): DataSidebarProps => {
  let selectedId: string | undefined;
  if (tableId != null) {
    selectedId = getTableNodeId(tableId);
  } else if (databaseId != null && schemaName != null) {
    selectedId = getSchemaNodeId(databaseId, schemaName);
  } else if (databaseId != null) {
    selectedId = getDatabaseNodeId(databaseId);
  }

  return {
    selectedId,
    entityGroups: [
      databases.map((database) => ({
        id: getDatabaseNodeId(database.id),
        name: database.name,
        entityId: getDatabaseEntityId(database),
        icon: "database" as const,
        children: getDatabaseChildren(database),
      })),
    ],
    filterPlaceholder: t`Search for a database, schema, or table`,
  };
};
