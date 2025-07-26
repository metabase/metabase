import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { createMockMetadata } from "__support__/metadata";
import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetTableQueryMetadataQuery,
  useUpdateTableComponentSettingsMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useTranslateContent } from "metabase/i18n/hooks";
import { useDispatch } from "metabase/lib/redux";
import { isSyncInProgress } from "metabase/lib/syncing";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { FilterPanel } from "metabase/querying/filters/components/FilterPanel";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import type { FilterChangeOpts } from "metabase/querying/filters/components/FilterPicker/types";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Popover,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";
import type { DatasetColumn } from "metabase/visualizations/lib/settings/column";
import * as Lib from "metabase-lib";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetQuery, Field, FieldId } from "metabase-types/api";

import { renderValue } from "../utils";

import { SortableFieldList } from "./SortableFieldList";
import S from "./TableListView.module.css";
import type { RouteParams } from "./types";
import {
  getDefaultComponentSettings,
  getExploreTableUrl,
  getRowCountQuery,
  parseRouteParams,
} from "./utils";

interface Props {
  location: Location;
  params: RouteParams;
}

const PAGE_SIZE = 15;
const CELL_PADDING_HORIZONTAL = "md" as const;
const CELL_PADDING_VERTICAL_NORMAL = "sm" as const;
const CELL_PADDING_VERTICAL_THIN = "xs" as const;

type SortDirection = "asc" | "desc";

interface SortState {
  columnId: FieldId;
  direction: SortDirection;
}

export const TableListView = ({ location, params }: Props) => {
  const dispatch = useDispatch();
  const tc = useTranslateContent();
  const { page, tableId } = parseRouteParams(location, params);
  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });

  const tableQuery = useMemo(() => {
    if (!table) {
      return undefined;
    }

    const metadata = createMockMetadata({
      tables: [table],
    });
    const metadataProvider = Lib.metadataProvider(table.db_id, metadata);
    const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);

    if (!tableMetadata) {
      return undefined;
    }

    return Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata);
  }, [table]);

  const [dataQuery, setDataQuery] = useState(tableQuery);
  const [sortState, setSortState] = useState<SortState | null>(null);

  const countQuery = useMemo<DatasetQuery | undefined>(() => {
    return table ? getRowCountQuery(table) : undefined;
  }, [table]);

  const { data: dataset } = useGetAdhocQueryQuery(
    dataQuery ? Lib.toLegacyQuery(dataQuery) : skipToken,
  );
  const { data: countDataset } = useGetAdhocQueryQuery(
    countQuery ? countQuery : skipToken,
  );
  const count = countDataset?.data.rows?.[0]?.[0];
  const allColumns = useMemo(
    () => dataset?.data?.results_metadata?.columns ?? [],
    [dataset],
  );

  const [updateTableComponentSettings] =
    useUpdateTableComponentSettingsMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [settings, setSettings] = useState(
    table?.component_settings ?? getDefaultComponentSettings(table),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterPickerOpen, setIsFilterPickerOpen] = useState(false);

  const pkIndex = allColumns.findIndex(isPK); // TODO: handle multiple PKs

  const handleOrderChange = (fieldOrder: FieldId[]) => {
    setSettings((settings) => ({
      ...settings,
      list_view: {
        ...settings.list_view,
        fields: fieldOrder.map((id) => {
          return settings.list_view.fields.find(
            (field) => field.field_id === id,
          )!;
        }),
      },
    }));
  };

  const handleStyleChange = (
    field: Field,
    style: "normal" | "bold" | "dim",
  ) => {
    setSettings((settings) => ({
      ...settings,
      list_view: {
        ...settings.list_view,
        fields: settings.list_view.fields.map((f) => {
          if (f.field_id === getRawTableFieldId(field)) {
            return { ...f, style };
          }
          return f;
        }),
      },
    }));
  };

  const handleRowHeightChange = (rowHeight: "thin" | "normal") => {
    setSettings((settings) => ({
      ...settings,
      list_view: {
        ...settings.list_view,
        row_height: rowHeight,
      },
    }));
  };

  const handleSubmit = () => {
    setIsEditing(false);

    updateTableComponentSettings({ id: tableId, component_settings: settings });
  };

  const handleFilterChange = (newQuery: Lib.Query, opts: FilterChangeOpts) => {
    setDataQuery(newQuery);

    if (opts.run) {
      setIsFilterPickerOpen(false);
    }
  };

  const handleColumnSort = (datasetColumn: DatasetColumn) => {
    if (!dataQuery || !table) {
      return;
    }

    const newDirection: SortDirection =
      sortState?.columnId === datasetColumn.id && sortState?.direction === "asc"
        ? "desc"
        : "asc";

    setSortState({
      columnId: datasetColumn.id!,
      direction: newDirection,
    });

    const orderableColumns = Lib.orderableColumns(dataQuery, -1);
    const column = orderableColumns.find((column) => {
      const info = Lib.displayInfo(dataQuery, -1, column);
      return info.name === datasetColumn.name;
    });

    if (!column) {
      return;
    }

    let newQuery = dataQuery;

    const existingOrderBys = Lib.orderBys(newQuery, -1);
    newQuery = existingOrderBys.reduce(
      (query, orderBy) => Lib.removeClause(query, -1, orderBy),
      newQuery,
    );

    const orderByClause = Lib.orderByClause(column, newDirection);
    newQuery = Lib.orderBy(newQuery, -1, orderByClause);

    setDataQuery(newQuery);
  };

  useEffect(() => {
    if (table) {
      setSettings(
        table.component_settings ?? getDefaultComponentSettings(table),
      );
    }
  }, [table]);

  useEffect(() => {
    setDataQuery(tableQuery);
  }, [tableQuery]);

  const columns = settings.list_view.fields.map(({ field_id }) => {
    return allColumns.find((field) => field.id === field_id)!;
  });
  const fields = settings.list_view.fields.map(({ field_id }) => {
    return (table?.fields ?? []).find((field) => field.id === field_id)!;
  });
  const visibleFields = settings.list_view.fields.map(({ field_id }) => {
    return fields.find((field) => field.id === field_id)!;
  });
  const hiddenFields = (table?.fields ?? []).filter((field) =>
    settings.list_view.fields.every((f) => f.field_id !== field.id),
  );

  const stylesMap = settings.list_view.fields.reduce<
    Record<FieldId, "normal" | "bold" | "dim">
  >((acc, field) => {
    acc[field.field_id] = field.style;
    return acc;
  }, {});
  const allRows = useMemo(() => dataset?.data?.rows ?? [], [dataset]);
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) {
      return allRows;
    }

    const query = searchQuery.toLowerCase();
    // TODO: do not search hidden columns
    // TODO: use filtering for this? or search API? or... ?
    return allRows.filter((row) => {
      return row.some((value) => {
        if (value == null) {
          return false;
        }

        return String(value).toLowerCase().includes(query);
      });
    });
  }, [allRows, searchQuery]);

  const paginatedRows = useMemo(
    () => filteredRows.slice(PAGE_SIZE * page, PAGE_SIZE * (page + 1)),
    [filteredRows, page],
  );

  const transformedPaginatedRows = useMemo(
    () =>
      paginatedRows.map((row) => {
        return settings.list_view.fields.map(({ field_id }) => {
          const fieldIndex = allColumns.findIndex((col) => col.id === field_id);
          return row[fieldIndex];
        });
      }),
    [settings, paginatedRows, allColumns],
  );

  const cellPaddingVertical =
    settings.list_view.row_height === "normal"
      ? CELL_PADDING_VERTICAL_NORMAL
      : CELL_PADDING_VERTICAL_THIN;

  if (!table || !dataset || !allColumns || !dataQuery) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Group align="flex-start" gap={0} wrap="nowrap" h="100%">
      <Stack gap="md" p="xl" flex="1" miw={0}>
        <Group align="flex-start" justify="space-between">
          <Stack gap="xs">
            <Title>{table.display_name}</Title>
            {typeof count === "number" && (
              <Text c="text-secondary" size="sm">
                {searchQuery.trim()
                  ? `${filteredRows.length} of ${count} rows`
                  : count === 1
                    ? t`1 row`
                    : t`${count} rows`}
              </Text>
            )}
          </Stack>

          <Group align="center" gap="md">
            <PaginationControls
              itemsLength={paginatedRows.length}
              page={page}
              pageSize={PAGE_SIZE}
              onNextPage={() => {
                dispatch(push(`/table/${tableId}?page=${page + 1}`));
              }}
              onPreviousPage={() => {
                if (page === 1) {
                  dispatch(push(`/table/${tableId}`));
                } else {
                  dispatch(push(`/table/${tableId}?page=${page - 1}`));
                }
              }}
            />

            <TextInput
              leftSection={<Icon name="search" />}
              placeholder={t`Search...`}
              value={searchQuery}
              w={250}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
            />

            <Popover
              opened={isFilterPickerOpen}
              onClose={() => setIsFilterPickerOpen(false)}
            >
              <Popover.Target>
                <Button
                  leftSection={<Icon name="filter" />}
                  variant="default"
                  onClick={() => setIsFilterPickerOpen((value) => !value)}
                >
                  {t`Filter`}
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <MultiStageFilterPicker
                  canAppendStage
                  query={dataQuery}
                  onChange={handleFilterChange}
                  onClose={() => setIsFilterPickerOpen(false)}
                />
              </Popover.Dropdown>
            </Popover>

            {!isSyncInProgress(table) && !isEditing && (
              <Button
                component={Link}
                leftSection={<Icon name="insight" />}
                to={getExploreTableUrl(table)}
                variant="primary"
              >{t`Explore results`}</Button>
            )}

            {!isEditing && (
              <Button
                leftSection={<Icon name="pencil" />}
                variant="outline"
                onClick={() => setIsEditing(true)}
              >
                {t`Edit`}
              </Button>
            )}
          </Group>
        </Group>

        <FilterPanel
          className={S.filterPanel}
          query={dataQuery}
          onChange={setDataQuery}
        />

        <Group
          className={S.tableContainer}
          align="flex-start"
          wrap="nowrap"
          style={{ overflow: "auto" }}
        >
          <Box bg="white" className={S.table} component="table" w="100%">
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <Box
                    component="th"
                    key={index}
                    px={CELL_PADDING_HORIZONTAL}
                    py="md"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleColumnSort(column)}
                  >
                    <Group gap="sm" align="center" wrap="nowrap">
                      <Text c="text-secondary" size="sm">
                        {column.display_name}
                      </Text>

                      {sortState && sortState.columnId === column.id && (
                        <Icon
                          c="text-secondary"
                          name={
                            sortState.direction === "asc"
                              ? "chevronup"
                              : "chevrondown"
                          }
                          size={12}
                        />
                      )}
                    </Group>
                  </Box>
                ))}

                <Box component="th" px="sm" py="md" />
              </tr>
            </thead>

            <tbody>
              {transformedPaginatedRows.map((row, index) => {
                return (
                  <Box className={S.row} component="tr" key={index}>
                    {row.map((value, cellIndex) => {
                      return (
                        <Box
                          c={
                            settings.list_view.fields[cellIndex].style === "dim"
                              ? "text-light"
                              : "text-primary"
                          }
                          component="td"
                          fw={
                            settings.list_view.fields[cellIndex].style ===
                            "bold"
                              ? "bold"
                              : undefined
                          }
                          key={cellIndex}
                          px={CELL_PADDING_HORIZONTAL}
                          py={cellPaddingVertical}
                        >
                          {renderValue(tc, value, columns[cellIndex])}
                        </Box>
                      );
                    })}

                    <Box
                      component="td"
                      pr={CELL_PADDING_HORIZONTAL}
                      py={cellPaddingVertical}
                    >
                      <ActionIcon
                        className={S.link}
                        component={Link}
                        to={
                          pkIndex !== undefined &&
                          pkIndex >= 0 &&
                          !searchQuery.trim()
                            ? `/table/${table.id}/detail/${paginatedRows[index][pkIndex]}`
                            : ""
                        }
                        variant="outline"
                      >
                        <Icon name="share" />
                      </ActionIcon>
                    </Box>
                  </Box>
                );
              })}
            </tbody>
          </Box>
        </Group>
      </Stack>

      {isEditing && (
        <Stack
          bg="white"
          flex="0 0 auto"
          miw={400}
          gap="lg"
          h="100%"
          p="xl"
          style={{
            // boxShadow: "0px 1px 4px 0px var(--mb-color-shadow)",
            borderLeft: "1px solid var(--border-color)",
            overflow: "auto",
          }}
        >
          <Group align="center" gap="md" justify="space-between">
            <Title order={2}>{t`Display settings`}</Title>

            {isEditing && (
              <Button
                leftSection={<Icon name="check" />}
                type="submit"
                variant="filled"
                onClick={handleSubmit}
              >
                {t`Save`}
              </Button>
            )}
          </Group>

          <Select
            data={[
              { value: "normal", label: t`Normal` },
              { value: "thin", label: t`Thin` },
            ]}
            label={t`Row height`}
            value={settings.list_view.row_height}
            onChange={handleRowHeightChange}
            w="100%"
          />

          <Stack gap={4}>
            <Text
              c="text-primary"
              fw="bold"
              lh="var(--mantine-line-height-md)"
            >{t`Shown columns`}</Text>
            <SortableFieldList
              fields={visibleFields}
              stylesMap={stylesMap}
              onChange={handleOrderChange}
              onStyleChange={handleStyleChange}
              onToggleVisibility={(field) => {
                setSettings((settings) => ({
                  ...settings,
                  list_view: {
                    ...settings.list_view,
                    fields: settings.list_view.fields.filter(
                      (f) => f.field_id !== field.id,
                    ),
                  },
                }));
              }}
            />
          </Stack>

          <Stack gap={4}>
            <Text
              c="text-primary"
              fw="bold"
              lh="var(--mantine-line-height-md)"
            >{t`Hidden columns`}</Text>
            <SortableFieldList
              disabled
              fields={hiddenFields}
              isHidden
              onChange={handleOrderChange}
              onToggleVisibility={(field) => {
                setSettings((settings) => ({
                  ...settings,
                  list_view: {
                    ...settings.list_view,
                    fields: [
                      ...settings.list_view.fields,
                      {
                        field_id: getRawTableFieldId(field),
                        style: "normal",
                      },
                    ],
                  },
                }));
              }}
            />
          </Stack>
        </Stack>
      )}
    </Group>
  );
};
