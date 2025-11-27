import { useContext, useEffect, useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useListTablesQuery } from "metabase/api/table";
import { DataModelContext } from "metabase/metadata/pages/shared/DataModelContext";
import { parseRouteParams } from "metabase/metadata/pages/shared/utils";
import { Box, Flex, Loader, Text } from "metabase/ui";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import type { RouteParams } from "../../../pages/DataModel/types";
import type { FlatItem, FilterState } from "../types";

import { TablePickerResults } from "./Results";

interface SearchNewProps {
  query: string;
  params: RouteParams;
  filters: FilterState;
  setOnUpdateCallback: (callback: (() => void) | null) => void;
}

class DatabaseItem {
  public schemas: SchemaItem[] = [];
  constructor(public databaseId: number) {}

  addSchema(schema: SchemaItem) {
    this.schemas.push(schema);
  }
}

class SchemaItem {
  public tables: TableItem[] = [];
  constructor(public schemaName: string) {}

  addTable(table: TableItem) {
    this.tables.push(table);
  }
}

class TableItem {
  constructor(public tableId: number) {}
}

function buildFlatItemList(
  tables: any[],
  selectedTables: Set<number>,
): FlatItem[] {
  const result: FlatItem[] = [];
  const seenDatabases = new Map<number, DatabaseItem>();
  const seenSchemas = new Set<string>();

  tables.forEach((table) => {
    const dbId = table.db_id;
    const dbName = table.db?.name;
    const schemaName = table.schema;

    // Add database if not seen
    if (dbId && !seenDatabases.has(dbId)) {
      seenDatabases.set(dbId, new DatabaseItem(dbId));
      result.push({
        type: "database",
        key: `db-${dbId}`,
        label: dbName || `Database ${dbId}`,
        value: { databaseId: dbId },
        level: 0,
        isExpanded: true,
        children: [],
        isSelected: "no",
      });
    }

    // Add schema if not seen (use combination of db + schema as key)
    const schemaKey = `${dbId}:${schemaName}`;
    if (schemaName && !seenSchemas.has(schemaKey)) {
      seenSchemas.add(schemaKey);
      result.push({
        type: "schema",
        key: `schema-${dbId}-${schemaName}`,
        label: schemaName,
        value: { databaseId: dbId, schemaName: schemaName },
        level: 1,
        isExpanded: true,
        parent: `db-${dbId}`,
        children: [],
        isSelected: "no",
      });
    }

    // Add table
    result.push({
      type: "table",
      key: `table-${table.id}`,
      label: table.display_name || table.name,
      value: {
        databaseId: dbId,
        schemaName: schemaName,
        tableId: table.id,
      },
      level: schemaName ? 2 : 1,
      parent: schemaName ? `schema-${dbId}-${schemaName}` : `db-${dbId}`,
      children: [],
      table: table,
      isSelected: selectedTables.has(table.id) ? "yes" : "no",
    });
  });

  return result;
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

  const flatItems = useMemo(
    () => buildFlatItemList(filteredTables, selectedTables),
    [filteredTables, selectedTables],
  );

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

  const handleRangeSelect = (items: FlatItem[], targetItem: FlatItem) => {
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
