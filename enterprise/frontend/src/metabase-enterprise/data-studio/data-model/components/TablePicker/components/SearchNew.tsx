import cx from "classnames";
import { useContext, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useListTablesQuery } from "metabase/api/table";
import { DataModelContext } from "metabase/metadata/pages/shared/DataModelContext";
import { getUrl, parseRouteParams } from "metabase/metadata/pages/shared/utils";
import { Box, Checkbox, Flex, Icon, Loader, Stack, Text } from "metabase/ui";
import type { TableId } from "metabase-types/api";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import type { RouteParams } from "../../../pages/DataModel/types";
import type { FilterState } from "../types";

import S from "./Results.module.css";

interface SearchNewProps {
  query: string;
  params: RouteParams;
  filters: FilterState;
  setOnUpdateCallback: (callback: (() => void) | null) => void;
}

export function SearchNew({
  query,
  params,
  filters,
  setOnUpdateCallback,
}: SearchNewProps) {
  const { selectedTables, setSelectedTables, selectedItemsCount } =
    useSelection();
  const routeParams = parseRouteParams(params);
  const { baseUrl } = useContext(DataModelContext);
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

  const lastSelectedTableIndex = useRef<number | null>(null);

  useEffect(() => {
    if (selectedItemsCount === 0) {
      lastSelectedTableIndex.current = null;
    }
  }, [selectedItemsCount]);

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

  const handleTableSelect = (
    tableId: TableId,
    tableIndex: number,
    options?: { isShiftPressed?: boolean },
  ) => {
    const isShiftPressed = Boolean(options?.isShiftPressed);
    const hasRangeAnchor = lastSelectedTableIndex.current != null;

    if (isShiftPressed && hasRangeAnchor) {
      const anchorIndex = lastSelectedTableIndex.current;
      if (anchorIndex == null) {
        return;
      }

      const start = Math.min(anchorIndex, tableIndex);
      const end = Math.max(anchorIndex, tableIndex);
      const rangeTables = filteredTables.slice(start, end + 1);

      setSelectedTables((prev) => {
        const newSet = new Set(prev);
        rangeTables.forEach((rangeTable) => {
          newSet.add(rangeTable.id);
        });
        return newSet;
      });

      lastSelectedTableIndex.current = tableIndex;
      return;
    }

    setSelectedTables((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tableId)) {
        newSet.delete(tableId);
      } else {
        newSet.add(tableId);
      }
      return newSet;
    });

    lastSelectedTableIndex.current = tableIndex;
  };

  return (
    <Stack h="100%" style={{ overflow: "auto" }}>
      <Stack gap={0}>
        {filteredTables.map((table, tableIndex) => {
          const breadcrumbs = table.schema
            ? `${table.db?.name} (${table.schema})`
            : table.db?.name;
          const isActive =
            selectedItemsCount === 0 &&
            routeParams.databaseId === table.db_id &&
            routeParams.schemaName === table.schema &&
            routeParams.tableId === table.id;

          return (
            <Flex
              component={Link}
              aria-selected={isActive}
              className={cx(S.item, {
                [S.active]: isActive,
              })}
              key={table.id}
              data-testid="tree-item"
              data-type="table"
              py="sm"
              pe="sm"
              align="center"
              gap="sm"
              to={getUrl(baseUrl, {
                databaseId: table.db_id,
                schemaName: table.schema,
                tableId: table.id,
              })}
              pos="relative"
              left={0}
              right={0}
            >
              <Checkbox
                w={40}
                style={{
                  alignSelf: "flex-start",
                  justifyContent: "center",
                  position: "relative",
                  top: 4,
                  display: "flex",
                }}
                size="sm"
                checked={selectedTables.has(table.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  handleTableSelect(table.id, tableIndex, {
                    isShiftPressed: Boolean(
                      (event.nativeEvent as { shiftKey?: boolean }).shiftKey,
                    ),
                  });
                }}
                onChange={() => {}}
              />
              <Icon
                style={{
                  alignSelf: "flex-start",
                  position: "relative",
                  top: 4,
                }}
                name="table2"
                c={isActive ? "brand" : "text-light"}
                size={16}
              />
              <Text
                c={isActive ? "brand" : "text-primary"}
                fw={500}
                style={{ flex: 1 }}
              >
                {table.display_name}
              </Text>
              {breadcrumbs && (
                <BreadCrumbs active={isActive} breadcrumbs={breadcrumbs} />
              )}
            </Flex>
          );
        })}
      </Stack>
    </Stack>
  );
}

function BreadCrumbs({
  breadcrumbs,
  active = true,
}: {
  breadcrumbs: string;
  active?: boolean;
}) {
  if (!breadcrumbs) {
    return null;
  }

  return (
    <Text
      ta="right"
      flex="0 0 auto"
      c={active ? "var(--mb-color-text-medium)" : "var(--mb-color-text-light)"}
      fz="0.75rem"
      lh="1rem"
      lineClamp={1}
      maw="40%"
    >
      {breadcrumbs}
    </Text>
  );
}
