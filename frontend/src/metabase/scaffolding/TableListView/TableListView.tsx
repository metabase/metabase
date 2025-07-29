import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { push, replace } from "react-router-redux";
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
import { useDispatch } from "metabase/lib/redux";
import { isSyncInProgress } from "metabase/lib/syncing";
import { getUrl } from "metabase/metadata/pages/DataModel/utils";
import { FilterPanel } from "metabase/querying/filters/components/FilterPanel";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import type { FilterChangeOpts } from "metabase/querying/filters/components/FilterPicker/types";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Menu,
  Popover,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "metabase/ui";
import type { DatasetColumn } from "metabase/visualizations/lib/settings/column";
import * as Lib from "metabase-lib";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetQuery } from "metabase-types/api";

import { DetailViewSidebar } from "../TableDetailView/DetailViewSidebar";
import { TableDetailViewInner } from "../TableDetailView/TableDetailView";

import { TableDataView } from "./TableDataView";
import S from "./TableListView.module.css";
import { TableSettingsPanel } from "./TableSettingsPanel";
import {
  type RouteParams,
  type SortDirection,
  type SortState,
  isComponentSettings,
} from "./types";
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

export const TableListView = ({ location, params }: Props) => {
  const dispatch = useDispatch();
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
  const columns = useMemo(
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

  const handleViewChange = (view: "table" | "list" | "gallery") => {
    setSettings((settings) => ({
      ...settings,
      list_view: {
        ...settings.list_view,
        view,
      },
    }));
  };

  const handleSubmit = () => {
    setIsEditing(false);

    updateTableComponentSettings({ id: tableId, component_settings: settings });
  };

  const handleCancel = useCallback(() => {
    setIsEditing(false);

    if (table) {
      setSettings(
        table.component_settings ?? getDefaultComponentSettings(table),
      );
    }
  }, [table]);

  const handleFilterChange = (newQuery: Lib.Query, opts: FilterChangeOpts) => {
    setDataQuery(newQuery);
    dispatch(replace(`/table/${tableId}`));

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
      if (
        !table.component_settings ||
        !isComponentSettings(table.component_settings) // if schema change, reset settings
      ) {
        setSettings(getDefaultComponentSettings(table));
      } else {
        setSettings(table.component_settings);
      }
    }
  }, [table]);

  useEffect(() => {
    setDataQuery(tableQuery);
  }, [tableQuery]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isEditing) {
        handleCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditing, handleCancel]);

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

  const pkIndex = columns.findIndex(isPK); // TODO: handle multiple PKs

  if (!table || !dataset || !columns || !dataQuery) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Group align="flex-start" gap={0} wrap="nowrap" h="100%">
      <Stack
        gap="md"
        p="xl"
        flex="1"
        miw={0}
        h="100%"
        style={{ overflow: "auto" }}
      >
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
              total={filteredRows.length}
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
              onChange={(event) => {
                setSearchQuery(event.currentTarget.value);
                dispatch(replace(`/table/${tableId}`));
              }}
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

            {!isEditing && (
              <Button
                leftSection={<Icon name="gear" />}
                variant="outline"
                onClick={() => setIsEditing(true)}
              >
                {t`Display settings`}
              </Button>
            )}

            {!isSyncInProgress(table) && (
              <Menu position="bottom-end">
                <Menu.Target>
                  <Tooltip label={t`More`}>
                    <ActionIcon aria-label={t`More`} variant="transparent">
                      <Box c="text-primary">
                        <Icon name="ellipsis" />
                      </Box>
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<Icon name="insight" />}
                    component={Link}
                    to={getExploreTableUrl(table)}
                  >
                    {t`Explore results`}
                  </Menu.Item>

                  <Menu.Item
                    leftSection={<Icon name="bolt_filled" />}
                    component={Link}
                    to={`/auto/dashboard/table/${tableId}`}
                  >
                    {t`X-ray this table`}
                  </Menu.Item>

                  <Menu.Item
                    leftSection={<Icon name="reference" />}
                    component={Link}
                    to={`/reference/databases/${table.db_id}/tables/${table.id}`}
                  >
                    {t`Learn about this table`}
                  </Menu.Item>

                  <Menu.Item
                    leftSection={<Icon name="table2" />}
                    component={Link}
                    to={getUrl({
                      databaseId: table.db_id,
                      schemaName: table.schema,
                      tableId: table.id,
                      fieldId: undefined,
                    })}
                  >
                    {t`Edit table metadata`}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>

        <FilterPanel
          className={S.filterPanel}
          query={dataQuery}
          onChange={(query) => {
            setDataQuery(query);
            dispatch(replace(`/table/${tableId}`));
          }}
        />

        {settings.list_view.view === "table" && (
          <TableDataView
            columns={columns}
            rows={paginatedRows}
            settings={settings}
            sortState={sortState}
            table={table}
            onSort={handleColumnSort}
          />
        )}

        {settings.list_view.view === "list" && (
          <Stack gap="md">
            {paginatedRows.map((row, index) => {
              return (
                <TableDetailViewInner
                  key={index}
                  tableId={table.id as number}
                  rowId={row[pkIndex] as number}
                  dataset={dataset}
                  table={table}
                  isEdit={isEditing}
                  isListView
                  sectionsOverride={settings.list_view.list.sections}
                />
              );
            })}
          </Stack>
        )}

        {settings.list_view.view === "gallery" && (
          <Box
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}
          >
            {paginatedRows.map((row, index) => {
              return (
                <TableDetailViewInner
                  key={index}
                  tableId={table.id as number}
                  rowId={row[pkIndex] as number}
                  dataset={dataset}
                  table={table}
                  isEdit={isEditing}
                  isListView
                  sectionsOverride={settings.list_view.gallery.sections}
                />
              );
            })}
          </Box>
        )}
      </Stack>

      {isEditing && (
        <Stack
          bg="white"
          flex="0 0 auto"
          gap={0}
          miw={400}
          h="100%"
          style={{
            // boxShadow: "0px 1px 4px 0px var(--mb-color-shadow)",
            borderLeft: "1px solid var(--border-color)",
          }}
        >
          <Box
            bg="white"
            p="xl"
            style={{
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            <Group justify="space-between" align="center">
              <Title order={2}>{t`Display settings`}</Title>

              <Button
                aria-label={t`Close`}
                c="text-medium"
                size="compact-sm"
                variant="subtle"
                onClick={handleCancel}
              >
                <Icon name="close" />
              </Button>
            </Group>
          </Box>

          <Box flex="1" p="xl" style={{ overflow: "auto" }}>
            <Stack gap="lg">
              <Stack gap="xs">
                <Text
                  c="text-primary"
                  fw="bold"
                  lh="var(--mantine-line-height-md)"
                >
                  {t`Layout`}
                </Text>

                <SegmentedControl
                  data={[
                    { value: "table", label: t`Table` },
                    { value: "list", label: t`List` },
                    { value: "gallery", label: t`Gallery` },
                  ]}
                  value={settings.list_view.view}
                  onChange={handleViewChange}
                  w="100%"
                />
              </Stack>

              {settings.list_view.view === "table" && (
                <TableSettingsPanel
                  table={table}
                  value={settings}
                  onChange={setSettings}
                />
              )}

              {settings.list_view.view === "list" && (
                <DetailViewSidebar
                  columns={columns}
                  sections={settings.list_view.list.sections}
                  onUpdateSection={(id, update) => {
                    setSettings((settings) => ({
                      ...settings,
                      list_view: {
                        ...settings.list_view,
                        list: {
                          ...settings.list_view.list,
                          sections: settings.list_view.list.sections.map((s) =>
                            s.id === id ? { ...s, ...update } : s,
                          ),
                        },
                      },
                    }));
                  }}
                />
              )}

              {settings.list_view.view === "gallery" && (
                <DetailViewSidebar
                  columns={columns}
                  sections={settings.list_view.gallery.sections}
                  onUpdateSection={(id, update) => {
                    setSettings((settings) => ({
                      ...settings,
                      list_view: {
                        ...settings.list_view,
                        gallery: {
                          ...settings.list_view.gallery,
                          sections: settings.list_view.gallery.sections.map(
                            (s) => (s.id === id ? { ...s, ...update } : s),
                          ),
                        },
                      },
                    }));
                  }}
                />
              )}
            </Stack>
          </Box>

          <Box
            bg="white"
            px="xl"
            py="md"
            style={{
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <Group gap="md" justify="space-between">
              <Button size="sm" variant="subtle" onClick={handleCancel}>
                {t`Cancel`}
              </Button>

              <Button
                size="sm"
                type="submit"
                variant="filled"
                onClick={handleSubmit}
              >
                {t`Save`}
              </Button>
            </Group>
          </Box>
        </Stack>
      )}
    </Group>
  );
};
