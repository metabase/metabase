import cx from "classnames";
import { useContext, useEffect } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useListTablesQuery } from "metabase/api/table";
import { Box, Checkbox, Flex, Icon, Loader, Stack, Text } from "metabase/ui";
import type { TableId } from "metabase-types/api";

import { DataModelContext } from "../../../DataModelContext";
import { useSelection } from "../../../contexts/SelectionContext";
import type { RouteParams } from "../../../types";
import { getUrl, parseRouteParams } from "../../../utils";
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
  const { selectedTables, setSelectedTables } = useSelection();
  const routeParams = parseRouteParams(params);
  const { baseUrl } = useContext(DataModelContext);
  const {
    data: tables,
    isLoading,
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
        ? null
        : (filters.ownerUserId ?? undefined),
    "owner-email": filters.ownerEmail ?? undefined,
    "orphan-only": filters.orphansOnly === true ? true : undefined,
  });

  useEffect(() => {
    setOnUpdateCallback(() => refetch);
    return () => setOnUpdateCallback(null);
  }, [refetch, setOnUpdateCallback]);

  if (isLoading) {
    return (
      <Flex justify="center" align="center" p="xl">
        <Loader />
      </Flex>
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <Box p="xl">
        <Text c="text.2">{t`No tables found`}</Text>
      </Box>
    );
  }

  function onTableSelect(tableId: TableId) {
    if (selectedTables.has(tableId)) {
      setSelectedTables((prev) => {
        const newSet = new Set(prev);
        newSet.delete(tableId);
        return newSet;
      });
    } else {
      setSelectedTables((prev) => {
        const newSet = new Set(prev);
        newSet.add(tableId);
        return newSet;
      });
    }
  }

  return (
    <Stack>
      <Stack gap={0} px="lg">
        {tables.map((table) => {
          const breadcrumbs = table.schema
            ? `${table.db?.name} (${table.schema})`
            : table.db?.name;
          const active =
            routeParams.databaseId === table.db_id &&
            routeParams.schemaName === table.schema &&
            routeParams.tableId === table.id;

          return (
            <Flex
              component={Link}
              className={cx(S.item, {
                [S.active]: active,
              })}
              key={table.id}
              p="sm"
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
                style={{
                  alignSelf: "flex-start",
                  position: "relative",
                  top: 4,
                }}
                size="sm"
                onChange={() => onTableSelect(table.id)}
                checked={selectedTables.has(table.id)}
                onClick={(event) => event.stopPropagation()}
              />
              <Icon
                style={{
                  alignSelf: "flex-start",
                  position: "relative",
                  top: 4,
                }}
                name="table2"
                c={active ? "brand" : "text-light"}
                size={16}
              />
              <Text
                c={active ? "brand" : "text-primary"}
                fw={500}
                style={{ flex: 1 }}
              >
                {table.display_name}
              </Text>
              {breadcrumbs && (
                <BreadCrumbs active={active} breadcrumbs={breadcrumbs} />
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
