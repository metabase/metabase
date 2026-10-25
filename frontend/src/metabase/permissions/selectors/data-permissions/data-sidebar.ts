import { t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { PLUGIN_AUDIT } from "metabase/plugins";
import { isNotNull } from "metabase/utils/types";
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
  title?: string;
  description?: string;
  entityGroups: DataTreeNodeItem[][];
  entityViewFocus?: "database";
  selectedId?: string;
  filterPlaceholder: string;
};

const getSchemaId = (name: string) => `schema:${name}`;
const getTableId = (id: string | number) => `table:${id}`;

const getDatabasesSidebar = (databases: Database[]): DataSidebarProps => {
  const entities = databases
    .filter((db) => !db.is_saved_questions)
    .filter((db) => !PLUGIN_AUDIT.isAuditDb(db))
    .filter((db) => !db.router_database_id)
    .map((database) => ({
      id: database.id,
      name: database.name,
      entityId: getDatabaseEntityId(database),
      icon: "database" as const,
    }));

  return {
    entityGroups: [entities],
    entityViewFocus: "database",
    filterPlaceholder: t`Search for a database`,
  };
};

const getTablesSidebar = (
  database: PermissionsDatabase,
  schemaName?: string,
  tableId?: string,
): DataSidebarProps => {
  let selectedId: string | undefined = undefined;

  if (tableId != null) {
    selectedId = getTableId(tableId);
  } else if (schemaName != null) {
    selectedId = getSchemaId(schemaName);
  }

  const schemas = getDatabaseSchemas(database);

  let entities = schemas
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map<DataTreeNodeItem>((schema) => {
      return {
        id: getSchemaId(schema.name),
        name: schema.name,
        entityId: getSchemaEntityId(schema),
        icon: "folder" as const,
        children: schema.tables
          .toSorted((a, b) => a.display_name.localeCompare(b.display_name))
          .map((table) => ({
            id: getTableId(table.id),
            entityId: getTableEntityId(table),
            name: table.display_name,
            icon: "table" as const,
          })),
      };
    });

  const shouldIncludeSchemas = schemas.length > 1;
  if (!shouldIncludeSchemas && entities[0]?.children != null) {
    entities = entities[0]?.children;
  }

  return {
    selectedId,
    title: database.name,
    description: t`Select a table to set more specific permissions`,
    entityGroups: [entities].filter(isNotNull),
    filterPlaceholder: t`Search for a table`,
  };
};

type DataFocusSidebarOpts = {
  params: RawDataRouteParams;
  databases: PermissionsDatabase[];
  database: PermissionsDatabase | undefined;
};

export const getDataFocusSidebar = ({
  params,
  databases,
  database,
}: DataFocusSidebarOpts): DataSidebarProps | null => {
  const { databaseId, schemaName, tableId } = params;

  if (databaseId == null) {
    return getDatabasesSidebar(databases);
  }

  if (database == null) {
    return null;
  }

  return getTablesSidebar(database, schemaName, tableId);
};
