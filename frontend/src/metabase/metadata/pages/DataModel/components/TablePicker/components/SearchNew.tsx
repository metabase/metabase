import cx from "classnames";
import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useListTablesQuery } from "metabase/api/table";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Icon,
  Loader,
  Stack,
  Text,
} from "metabase/ui";
import type { TableId } from "metabase-types/api";

import type { RouteParams } from "../../../types";
import { getUrl, parseRouteParams } from "../../../utils";

import { EditTableMetadataModal } from "./EditTableMetadataModal";
import type { FilterState } from "./FilterPopover";
import S from "./Results.module.css";

interface SearchNewProps {
  query: string;
  params: RouteParams;
  filters: FilterState;
}

export function SearchNew({ query, params, filters }: SearchNewProps) {
  const routeParams = parseRouteParams(params);
  const [selectedItems, setSelectedItems] = useState<Set<TableId>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    data: tables,
    isLoading,
    refetch,
  } = useListTablesQuery({
    term: query,
    visibility_type:
      filters.visibilityType == null
        ? undefined
        : filters.visibilityType === "visible"
          ? null
          : filters.visibilityType,
    visibility_type2: filters.visibilityType2 ?? undefined,
    data_source:
      filters.dataSource === "unknown"
        ? null
        : (filters.dataSource ?? undefined),
    owner_user_id:
      filters.ownerUserId === "unknown"
        ? null
        : (filters.ownerUserId ?? undefined),
    owner_email: filters.ownerEmail ?? undefined,
    include_hidden: filters.visibilityType != null,
  });

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
    if (selectedItems.has(tableId)) {
      setSelectedItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(tableId);
        return newSet;
      });
    } else {
      setSelectedItems((prev) => {
        const newSet = new Set(prev);
        newSet.add(tableId);
        return newSet;
      });
    }
  }

  return (
    <Stack>
      <Stack gap={0} px="xl">
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
              py="xs"
              align="center"
              gap="sm"
              to={getUrl({
                databaseId: table.db_id,
                schemaName: table.schema,
                tableId: table.id,
                collectionId: undefined,
                fieldId: undefined,
                fieldName: undefined,
                modelId: undefined,
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
                checked={selectedItems.has(table.id)}
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

      <Box>
        <Flex justify="center" direction="row" gap="sm">
          {selectedItems.size === 0 && (
            <Button
              onClick={() =>
                setSelectedItems(new Set(tables.map((table) => table.id)))
              }
              variant="transparent"
            >
              {t`Select all`}
            </Button>
          )}
          {selectedItems.size > 0 && (
            <>
              <Button onClick={() => setIsModalOpen(true)}>
                {t`Edit selected tables`}
              </Button>
              <Button
                variant="transparent"
                onClick={() => setSelectedItems(new Set())}
              >
                {t`Unselect all`}
              </Button>
            </>
          )}
        </Flex>
      </Box>
      <EditTableMetadataModal
        tables={selectedItems}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onUpdate={() => {
          refetch();
          setSelectedItems(new Set());
        }}
      />
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
