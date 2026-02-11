import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useListTablesQuery } from "metabase/api/table";
import { parseRouteParams } from "metabase/metadata/pages/shared/utils";
import { Box, Flex, Loader, Text } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import type { RouteParams } from "../../../pages/DataModel/types";
import {
  toggleDatabaseSelection,
  toggleSchemaSelection,
} from "../bulk-selection.utils";
import { useExpandedState } from "../hooks";
import type {
  DatabaseNode,
  FilterState,
  FlatItem,
  RootNode,
  SchemaNode,
  TableNode,
} from "../types";
import { isDatabaseItem, isSchemaItem, isTableNode } from "../types";
import { flatten, rootNode, toKey } from "../utils";

import { TablePickerResults } from "./Results";

interface SearchNewProps {
  query: string;
  params: RouteParams;
  filters: FilterState;
}

function buildResultTree(tables: Table[]): RootNode {
  const databases = new Map<string, DatabaseNode>();
  const seenSchemas = new Map<string, SchemaNode>();
  const root = rootNode();

  tables.forEach((table) => {
    const tableId = table.id;
    const databaseId = table.db_id;
    const schemaName = table.schema;
    const dbKey = toKey({ databaseId });
    const schemaKey = toKey({ databaseId, schemaName });
    const tableKey = toKey({
      databaseId,
      schemaName,
      tableId,
    });

    if (!databases.has(dbKey)) {
      const label = table.db?.name || String(databaseId);

      const databaseNode: DatabaseNode = {
        type: "database",
        key: dbKey,
        label,
        value: { databaseId: databaseId },
        children: [],
      };
      databases.set(dbKey, databaseNode);
      root.children.push(databaseNode);
    }

    if (!seenSchemas.has(schemaKey)) {
      const schemaNode: SchemaNode = {
        type: "schema",
        key: schemaKey,
        label: schemaName,
        value: { databaseId, schemaName },
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
        databaseId,
        schemaName,
        tableId,
      },
      children: [],
      table,
    };
    seenSchemas.get(schemaKey)?.children.push(tableNode);
  });

  return root;
}

export function SearchNew({ query, params, filters }: SearchNewProps) {
  const {
    selectedTables,
    setSelectedTables,
    selectedSchemas,
    selectedDatabases,
    resetSelection,
  } = useSelection();
  const routeParams = parseRouteParams(params);
  const { data: tables, isLoading: isLoadingTables } = useListTablesQuery({
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
  const { isExpanded: getIsExpanded, toggle } = useExpandedState(
    {}, // we expand all nodes, so need to pass path to expand specific branch
    {
      defaultClosed: false,
    },
  );

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

  const resultTree = useMemo(
    () => buildResultTree(filteredTables),
    [filteredTables],
  );

  // clear the selection when tables changes, to make sure that bulk operations
  // are performed on the intended tables
  useEffect(() => {
    resetSelection();
  }, [tables, resetSelection]);

  const flatItems = flatten(resultTree, {
    isExpanded: getIsExpanded,
    addLoadingNodes: false,
    canFlattenSingleSchema: true,
    selection: {
      tables: selectedTables,
      schemas: selectedSchemas,
      databases: selectedDatabases,
    },
  });

  const handleItemToggle = (item: FlatItem) => {
    const selection = {
      tables: selectedTables,
      schemas: selectedSchemas,
      databases: selectedDatabases,
    };

    if (isDatabaseItem(item)) {
      setSelectedTables(toggleDatabaseSelection(item, selection).tables);
    }

    if (isSchemaItem(item)) {
      setSelectedTables(toggleSchemaSelection(item, selection).tables);
    }
    if (isTableNode(item)) {
      setSelectedTables((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(item.value.tableId)) {
          newSet.delete(item.value.tableId);
        } else {
          newSet.add(item.value.tableId);
        }
        return newSet;
      });
    }
  };

  const handleRangeSelect = (items: FlatItem[]) => {
    const tableItems = items.filter((item) => isTableNode(item) && item.table);

    setSelectedTables((prev) => {
      const newSet = new Set(prev);
      tableItems.forEach((item) => {
        if (isTableNode(item) && item.table) {
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
        <Text c="text-tertiary">{t`No tables found`}</Text>
      </Box>
    );
  }

  return (
    <TablePickerResults
      items={flatItems}
      path={routeParams}
      onItemToggle={handleItemToggle}
      toggle={toggle}
      onRangeSelect={handleRangeSelect}
    />
  );
}
