import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseMetadataQuery, useListDatabasesQuery } from "metabase/api";
import { isNotNull } from "metabase/lib/types";
import { PLUGIN_AUDIT } from "metabase/plugins";
import type { IconName } from "metabase/ui";
import type { Database, DatabaseId, Table } from "metabase-types/api";

import type { EntityId } from "../types";

type DataTreeNodeItem = {
  id: string | number;
  name: string;
  icon: IconName;
  entityId: EntityId;
  children?: DataTreeNodeItem[];
};

export type DataSidebarData = {
  title?: string;
  description?: string;
  entityGroups: DataTreeNodeItem[][];
  entityViewFocus?: "database";
  selectedId?: string;
  filterPlaceholder: string;
};

const getSchemaId = (name: string) => `schema:${name}`;
const getTableId = (id: string | number) => `table:${id}`;

function getDatabaseEntityId(databaseId: DatabaseId): EntityId {
  return { databaseId };
}

function getSchemaEntityId(databaseId: DatabaseId, schemaName: string): EntityId {
  return { databaseId, schemaName };
}

function getTableEntityId(databaseId: DatabaseId, schemaName: string | null, tableId: Table["id"]): EntityId {
  return { databaseId, schemaName: schemaName ?? "", tableId: tableId as number };
}

function buildDatabasesSidebar(databases: Database[]): DataSidebarData {
  const filteredDatabases = databases.filter(
    (db) => !PLUGIN_AUDIT.isAuditDb(db),
  );

  const entities: DataTreeNodeItem[] = filteredDatabases.map((database) => ({
    id: database.id,
    name: database.name,
    entityId: getDatabaseEntityId(database.id),
    icon: "database",
  }));

  return {
    entityGroups: [entities],
    entityViewFocus: "database",
    filterPlaceholder: t`Search for a database`,
  };
}

function groupTablesBySchema(tables: Table[]): Map<string, Table[]> {
  const schemaMap = new Map<string, Table[]>();

  for (const table of tables) {
    const schemaName = table.schema ?? "";
    if (!schemaMap.has(schemaName)) {
      schemaMap.set(schemaName, []);
    }
    schemaMap.get(schemaName)!.push(table);
  }

  return schemaMap;
}

function buildTablesSidebar(
  database: Database,
  schemaName?: string,
  tableId?: string,
): DataSidebarData {
  let selectedId: string | undefined = undefined;

  if (tableId != null) {
    selectedId = getTableId(tableId);
  } else if (schemaName != null) {
    selectedId = getSchemaId(schemaName);
  }

  const tables = database.tables ?? [];
  const schemaMap = groupTablesBySchema(tables);
  const schemaNames = Array.from(schemaMap.keys()).sort((a, b) => a.localeCompare(b));

  let entities: DataTreeNodeItem[] = schemaNames.map((schema) => {
    const schemaTables = schemaMap.get(schema) ?? [];
    const sortedTables = [...schemaTables].sort((a, b) =>
      (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name)
    );

    return {
      id: getSchemaId(schema),
      name: schema || t`(empty schema)`,
      entityId: getSchemaEntityId(database.id, schema),
      icon: "folder",
      children: sortedTables.map((table) => ({
        id: getTableId(table.id),
        name: table.display_name ?? table.name,
        entityId: getTableEntityId(database.id, table.schema, table.id),
        icon: "table",
      })),
    };
  });

  // If only one schema, flatten to just show tables
  const shouldIncludeSchemas = schemaNames.length > 1;
  if (!shouldIncludeSchemas && entities[0]?.children != null) {
    entities = entities[0].children;
  }

  return {
    selectedId,
    title: database.name,
    description: t`Select a table to set more specific permissions`,
    entityGroups: [entities].filter(isNotNull),
    filterPlaceholder: t`Search for a table`,
  };
}

type UseDataPermissionsSidebarParams = {
  databaseId?: DatabaseId;
  schemaName?: string;
  tableId?: string;
};

export function useDataPermissionsSidebar({
  databaseId,
  schemaName,
  tableId,
}: UseDataPermissionsSidebarParams): {
  sidebar: DataSidebarData | null;
  isLoading: boolean;
  error?: unknown;
} {
  // Fetch all databases for the database list view
  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
  } = useListDatabasesQuery({ include_only_uploadable: false });

  // Fetch metadata for selected database (including tables)
  const {
    data: databaseMetadata,
    isLoading: isLoadingMetadata,
    error: metadataError,
  } = useGetDatabaseMetadataQuery(
    databaseId != null
      ? {
          id: databaseId,
          include_hidden: true,
          remove_inactive: true,
          skip_fields: true,
        }
      : skipToken,
  );

  const isLoading = isLoadingDatabases || isLoadingMetadata;

  const sidebar = useMemo((): DataSidebarData | null => {
    if (isLoading) {
      return null;
    }

    // No database selected - show database list
    if (databaseId == null) {
      if (!databasesResponse?.data) {
        return null;
      }
      return buildDatabasesSidebar(databasesResponse.data);
    }

    // Database selected - show tables
    if (!databaseMetadata) {
      return null;
    }

    return buildTablesSidebar(databaseMetadata, schemaName, tableId);
  }, [isLoading, databaseId, databasesResponse, databaseMetadata, schemaName, tableId]);

  return {
    sidebar,
    isLoading,
    error: metadataError,
  };
}
