import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useListTablesQuery } from "metabase/api/table";
import { parseRouteParams } from "metabase/metadata/pages/shared/utils";
import { Box, Flex, Loader, Text } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import type { RouteParams } from "../../../pages/DataModel/types";
import type {
  DatabaseNode,
  FilterState,
  FlatItem,
  RootNode,
  SchemaNode,
  TableNode,
} from "../types";
import { flatten, rootNode } from "../utils";

import { TablePickerResults } from "./Results";

interface SearchNewProps {
  query: string;
  params: RouteParams;
  filters: FilterState;
  setOnUpdateCallback: (callback: (() => void) | null) => void;
}

type DatabaseKey = `db-${number}`;
type SchemaKey = `schema-${number}-${string}`;

function buildResultTree(tables: Table[]): RootNode {
  const databases = new Map<DatabaseKey, DatabaseNode>();
  const seenSchemas = new Map<SchemaKey, SchemaNode>();
  const root = rootNode();

  tables.forEach((table) => {
    const dbKey = `db-${table.db_id}` as const;
    const schemaName = table.schema;
    const schemaKey = `schema-${table.db_id}-${schemaName}` as const;
    const tableKey = `table-${table.id}` as const;

    if (dbKey && !databases.has(dbKey)) {
      const dbName = table.db?.name;

      const databaseNode: DatabaseNode = {
        type: "database",
        key: dbKey,
        label: dbName || `Database ${table.db_id}`,
        value: { databaseId: table.db_id },
        children: [],
      };
      databases.set(dbKey, databaseNode);
      root.children.push(databaseNode);
    }

    if (schemaName && !seenSchemas.has(schemaKey)) {
      const schemaNode: SchemaNode = {
        type: "schema",
        key: schemaKey,
        label: schemaName,
        value: { databaseId: table.db_id, schemaName: schemaName },
        children: [],
      };
      seenSchemas.set(schemaKey, schemaNode);
      databases.get(dbKey)?.children.push(schemaNode);
    }

    const tableNode: TableNode = {
      type: "table",
      key: tableKey,
      label: table.display_name || table.name,
      value: {
        databaseId: table.db_id,
        schemaName: schemaName,
        tableId: table.id,
      },
      children: [],
      table: table,
    };
    seenSchemas.get(schemaKey)?.children.push(tableNode);
  });

  return root;
}

export function SearchNew({
  query,
  params,
  filters,
  setOnUpdateCallback,
}: SearchNewProps) {
  const { selectedTables, setSelectedTables } = useSelection();
  const routeParams = parseRouteParams(params);
  const {
    data: tables,
    isLoading: isLoadingTables,
    refetch,
  } = useListTablesQuery({
    term: query,
    "data-layer": filters.dataLayer ?? undefined,
    "data-source":
      filters.dataSource === "unknown"
        ? null
        : (filters.dataSource ?? undefined),
    "owner-user-id":
      filters.ownerUserId === "unknown"
        ? undefined
        : (filters.ownerUserId ?? undefined),
    "owner-email": filters.ownerEmail ?? undefined,
    "orphan-only": filters.ownerUserId === "unknown" ? true : undefined,
    "unused-only": filters.unusedOnly === true ? true : undefined,
  });
  const { data: databases, isLoading: isLoadingDatabases } =
    useListDatabasesQuery({ include_editable_data_model: true });

  const allowedDatabaseIds = useMemo(
    () => new Set(databases?.data.map((database) => database.id) ?? []),
    [databases],
  );

  const filteredTables = useMemo(() => {
    if (!tables || allowedDatabaseIds.size === 0) {
      return [];
    }

    return tables.filter((table) => allowedDatabaseIds.has(table.db_id));
  }, [allowedDatabaseIds, tables]);

  const isLoading = isLoadingTables || isLoadingDatabases;

  useEffect(() => {
    setOnUpdateCallback(() => refetch);
    return () => setOnUpdateCallback(null);
  }, [refetch, setOnUpdateCallback]);

  const resultTree = useMemo(
    () => buildResultTree(filteredTables),
    [filteredTables],
  );

  const flatItems = flatten(resultTree, {
    isExpanded: () => true,
    addLoadingNodes: false,
    selection: {
      tables: selectedTables,
      schemas: new Set(),
      databases: new Set(),
    },
  });

  const handleItemToggle = (item: FlatItem) => {
    if (item.type !== "table" || !item.table) {
      return;
    }

    setSelectedTables((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(item.table!.id)) {
        newSet.delete(item.table!.id);
      } else {
        newSet.add(item.table!.id);
      }
      return newSet;
    });
  };

  const handleRangeSelect = (items: FlatItem[]) => {
    const tableItems = items.filter(
      (item) => item.type === "table" && item.table,
    );

    setSelectedTables((prev) => {
      const newSet = new Set(prev);
      tableItems.forEach((item) => {
        if (item.type === "table" && item.table) {
          newSet.add(item.table.id);
        }
      });
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <Flex justify="center" align="center" p="xl">
        <Loader />
      </Flex>
    );
  }

  if (filteredTables.length === 0) {
    return (
      <Box p="xl">
        <Text c="text.2">{t`No tables found`}</Text>
      </Box>
    );
  }

  return (
    <TablePickerResults
      items={flatItems}
      path={{
        databaseId: routeParams.databaseId,
        schemaName: routeParams.schemaName,
        tableId: routeParams.tableId,
      }}
      onItemToggle={handleItemToggle}
      onRangeSelect={handleRangeSelect}
    />
  );
}
