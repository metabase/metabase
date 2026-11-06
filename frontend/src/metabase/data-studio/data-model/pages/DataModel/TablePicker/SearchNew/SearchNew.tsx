import { useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useListTablesQuery } from "metabase/api/table";
import { trackDataStudioTablePickerSearchPerformed } from "metabase/common/data-studio/analytics";
import { useDataLayers } from "metabase/metadata/data-layers";
import { parseRouteParams } from "metabase/metadata/pages/shared/utils";
import {
  getTableHiddenReason,
  useTableStructures,
  useTablesWithFields,
} from "metabase/metadata/table-structure";
import { Box, Flex, Loader, Text } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { useSelection } from "../../contexts/SelectionContext";
import type { RouteParams } from "../../types";
import { TablePickerTreeTable } from "../TablePickerTreeTable";
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

interface SearchNewProps {
  query: string;
  params: RouteParams;
  filters: FilterState;
  isLibraryEnabled: boolean;
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
  isLibraryEnabled,
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
    "published-only": filters.publishedOnly === true ? true : undefined,
    include_hidden: filters.hiddenOnly === true ? true : undefined,
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

  // PROTOTYPE: mocked. Structure filters need each table's fields and are
  // applied here, since there's no API for them yet
  const hasStructureFilters =
    filters.needsReviewOnly === true ||
    filters.hiddenOnly === true ||
    filters.noMainDateOnly === true ||
    filters.noRoleOnly === true;
  const { tables: tablesWithFields, isLoading: isLoadingFields } =
    useTablesWithFields(filteredTables, { isEnabled: hasStructureFilters });
  const { getTableStructure } = useTableStructures();
  const { getTableDataLayer } = useDataLayers();

  const resultTables = useMemo(() => {
    if (!hasStructureFilters) {
      return filteredTables;
    }
    return tablesWithFields.filter((table) => {
      const structure = getTableStructure(table);
      const hiddenReason = getTableHiddenReason({
        table,
        role: structure.role,
        dataLayer: getTableDataLayer(table.db_id, table.schema, table.id).layer,
      });
      return (
        (filters.needsReviewOnly !== true || structure.needsReview) &&
        (filters.noRoleOnly !== true || structure.role == null) &&
        (filters.noMainDateOnly !== true || structure.mainDateField == null) &&
        (filters.hiddenOnly !== true || hiddenReason != null)
      );
    });
  }, [
    filteredTables,
    filters,
    getTableDataLayer,
    getTableStructure,
    hasStructureFilters,
    tablesWithFields,
  ]);

  const isLoading =
    isLoadingTables ||
    isFetchingTables ||
    isLoadingDatabases ||
    isLoadingFields;

  const resultTree = useMemo(
    () => buildResultTree(resultTables),
    [resultTables],
  );

  useEffect(() => {
    filterSelectedTables(resultTables.map((table) => table.id));
  }, [resultTables, filterSelectedTables]);

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
      <Flex justify="center" align="center" p="xxl">
        <Loader />
      </Flex>
    );
  }

  if (resultTables.length === 0) {
    return (
      <Box p="xxl">
        <Text c="text-secondary">{t`No tables found`}</Text>
      </Box>
    );
  }

  return (
    <TablePickerTreeTable
      tree={resultTree}
      path={routeParams}
      isExpanded={isExpanded}
      isLibraryEnabled={isLibraryEnabled}
      onToggle={toggle}
      onChange={onChange}
    />
  );
}
