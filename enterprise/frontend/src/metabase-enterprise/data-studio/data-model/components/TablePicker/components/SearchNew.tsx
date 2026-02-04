import { useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useListTablesQuery } from "metabase/api/table";
import { parseRouteParams } from "metabase/metadata/pages/shared/utils";
import { Box, Flex, Loader, Text } from "metabase/ui";
import { trackDataStudioTablePickerSearchPerformed } from "metabase-enterprise/data-studio/analytics";
import type { Table } from "metabase-types/api";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import type { RouteParams } from "../../../pages/DataModel/types";
import { useExpandedState } from "../hooks";
import type {
  DatabaseNode,
  FilterState,
  RootNode,
  SchemaNode,
  TableNode,
  TreePath,
} from "../types";
import { rootNode, toKey } from "../utils";

import { TablePickerTreeTable } from "./TablePickerTreeTable";

interface SearchNewProps {
  query: string;
  params: RouteParams;
  filters: FilterState;
  onChange?: (path: TreePath) => void;
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

export function SearchNew({
  query,
  params,
  filters,
  onChange,
}: SearchNewProps) {
  const { resetSelection, filterSelectedTables } = useSelection();

  const routeParams = parseRouteParams(params);
  const {
    data: tables,
    isLoading: isLoadingTables,
    isFetching: isFetchingTables,
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
    useListDatabasesQuery();
  const { isExpanded, toggle } = useExpandedState(
    {},
    { defaultExpanded: true },
  );

  const previousIsFetchingTables = usePrevious(isFetchingTables);

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

  useEffect(() => {
    filterSelectedTables(filteredTables.map((table) => table.id));
  }, [filteredTables, filterSelectedTables]);

  useEffect(() => {
    resetSelection();
  }, [query, filters, resetSelection]);

  useEffect(() => {
    const startedFetching =
      (previousIsFetchingTables === false ||
        previousIsFetchingTables === undefined) &&
      isFetchingTables === true;
    if (startedFetching) {
      trackDataStudioTablePickerSearchPerformed();
    }
  }, [previousIsFetchingTables, isFetchingTables]);

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
    <TablePickerTreeTable
      tree={resultTree}
      path={routeParams}
      isExpanded={isExpanded}
      onToggle={toggle}
      onChange={onChange}
    />
  );
}
