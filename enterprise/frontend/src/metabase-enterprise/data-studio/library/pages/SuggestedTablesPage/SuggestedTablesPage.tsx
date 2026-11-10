import type { Row } from "@tanstack/react-table";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useListDatabasesQuery, useListTablesQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useHasTokenFeature } from "metabase/common/hooks";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { useErrorHandling } from "metabase/data-studio/common/hooks/use-error-handling";
import { LibraryUpsellPage } from "metabase/data-studio/upsells/pages/LibraryUpsellPage";
import { useDataLayers } from "metabase/metadata/data-layers";
import {
  type TableRole,
  useTableStructures,
  useTablesWithFields,
} from "metabase/metadata/table-structure";
import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_REMOTE_SYNC,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import {
  Button,
  Card,
  Ellipsified,
  FixedSizeIcon,
  Flex,
  Group,
  Icon,
  type SelectionState,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { TableId } from "metabase-types/api";

import { LibraryEmptyState } from "../../components/LibraryEmptyState";
import { PublishTablesModal } from "../../components/PublishTablesModal";
import { PublishedDataTabs } from "../../components/PublishedDataTabs";
import { useLibraryCollections } from "../../hooks/use-library-collections";

import { EMPTY_FILTERS, SuggestedTablesFilter } from "./SuggestedTablesFilter";
import type { SuggestedTableRow, SuggestedTablesFilters } from "./types";

/**
 * Whether tables of each role are suggested: the ones people use directly,
 * for simple reports and record lookups. Left out: tables that only make
 * sense joined to something else (bridges, list items, lookups, calendars,
 * dimension fragments), versioned or raw key/value data, technical tables,
 * and Data Vault or anchor-modeling internals. Every role is listed, so a
 * new one needs a decision here. Tables with no role are suggested too.
 */
const IS_SUGGESTED_ROLE: Record<TableRole, boolean> = {
  "role/Fact": true,
  "role/TransactionFact": true,
  "role/EventFact": true,
  "role/PeriodicSnapshotFact": true,
  "role/AccumulatingSnapshotFact": true,
  "role/FactlessFact": false,
  "role/AggregateFact": true,
  "role/SessionFact": true,
  "role/UserDayFact": true,
  "role/CohortSnapshot": true,
  "role/ActivityStream": true,
  "role/Dimension": true,
  "role/EntityDimension": true,
  "role/DateDimension": false,
  "role/TimeDimension": false,
  "role/LookupDimension": false,
  "role/HistoryDimension": false,
  "role/MiniDimension": false,
  "role/JunkDimension": false,
  "role/OutriggerDimension": false,
  "role/Bridge": false,
  "role/HierarchyBridge": false,
  "role/ArrayChild": false,
  "role/CustomPropertyTable": false,
  "role/TranslationTable": false,
  "role/ConfigurationTable": false,
  "role/SystemTable": false,
  "role/OneBigTable": true,
  "role/Hub": false,
  "role/Link": false,
  "role/Satellite": false,
  "role/PointInTime": false,
  "role/Anchor": false,
  "role/Attribute": false,
  "role/Tie": false,
  "role/Knot": false,
};

/**
 * Unpublished tables in their database's final data layer whose role says
 * people would use them directly: the ones most likely ready for end users.
 */
export function SuggestedTablesPage() {
  const hasLibraryFeature = useHasTokenFeature("library");

  if (!hasLibraryFeature) {
    return <LibraryUpsellPage />;
  }

  return <SuggestedTablesPageContent />;
}

function SuggestedTablesPageContent() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<SuggestedTablesFilters>(EMPTY_FILTERS);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const {
    isLoading: isLoadingCollections,
    libraryCollection,
    tableCollection,
  } = useLibraryCollections();
  const {
    data: tables = [],
    isLoading: isLoadingTables,
    error: tablesError,
  } = useListTablesQuery();
  // The databases Connected data lists: no usage analytics, no saved questions
  const { data: databasesResponse, isLoading: isLoadingDatabases } =
    useListDatabasesQuery(PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps);
  const {
    getDataLayers,
    getSchemaDataLayer,
    getTableDataLayer,
    getSchemaDisplayName,
  } = useDataLayers();
  const { getTableStructure } = useTableStructures();
  useErrorHandling(tablesError);

  const canPublish = !!tableCollection?.can_write && !isRemoteSyncReadOnly;

  const databaseNames = useMemo(
    () =>
      new Map(
        (databasesResponse?.data ?? [])
          .filter((database) => !database.is_audit)
          .map((database) => [database.id, database.name]),
      ),
    [databasesResponse],
  );

  const finalLayerTables = useMemo(
    () =>
      tables.filter((table) => {
        if (table.is_published || !databaseNames.has(table.db_id)) {
          return false;
        }
        const finalLayer = getDataLayers(table.db_id).at(-1);
        const schemaLayer = getSchemaDataLayer(table.db_id, table.schema);
        // A table's own layer override can move it out of its schema's layer
        const { layer: tableLayer } = getTableDataLayer(
          table.db_id,
          table.schema,
          table.id,
        );
        return (
          finalLayer != null &&
          schemaLayer?.id === finalLayer.id &&
          tableLayer?.id === finalLayer.id
        );
      }),
    [
      tables,
      databaseNames,
      getDataLayers,
      getSchemaDataLayer,
      getTableDataLayer,
    ],
  );

  // Roles are inferred from fields, which the table list comes without
  const { tables: finalLayerTablesWithFields, isLoading: isLoadingFields } =
    useTablesWithFields(finalLayerTables, { isEnabled: true });

  const suggestedRows = useMemo(
    (): SuggestedTableRow[] =>
      finalLayerTablesWithFields
        .filter((table) => {
          const { role } = getTableStructure(table);
          return role == null || IS_SUGGESTED_ROLE[role];
        })
        .map((table) => ({
          id: table.id,
          table,
          databaseName: databaseNames.get(table.db_id) ?? "",
          schemaName: getSchemaDisplayName(table.db_id, table.schema),
        }))
        .sort((a, b) =>
          a.table.display_name.localeCompare(b.table.display_name),
        ),
    [
      finalLayerTablesWithFields,
      databaseNames,
      getTableStructure,
      getSchemaDisplayName,
    ],
  );

  const trimmedQuery = searchQuery.trim();
  const visibleRows = useMemo(() => {
    const query = trimmedQuery.toLowerCase();
    return suggestedRows.filter(
      ({ table }) =>
        (filters.databaseId == null || table.db_id === filters.databaseId) &&
        (filters.schemaName == null || table.schema === filters.schemaName) &&
        (query === "" || table.display_name.toLowerCase().includes(query)),
    );
  }, [suggestedRows, filters, trimmedQuery]);

  const {
    selectedIds,
    getSelectionState,
    onCheckboxClick,
    onSelectAllClick,
    clear,
  } = useTableSelection(visibleRows);

  const columns = useMemo(
    (): TreeTableColumnDef<SuggestedTableRow>[] => [
      {
        id: "name",
        header: t`Name`,
        width: "auto",
        maxAutoWidth: 480,
        accessorFn: (row) => row.table.display_name,
        cell: ({ row }) => (
          <Group gap="sm" wrap="nowrap" miw={0}>
            <FixedSizeIcon name="table" c="text-secondary" />
            <Ellipsified>{row.original.table.display_name}</Ellipsified>
          </Group>
        ),
      },
      {
        id: "database",
        header: t`Database`,
        width: "auto",
        accessorFn: (row) => row.databaseName,
        cell: ({ row }) => (
          <Ellipsified>{row.original.databaseName}</Ellipsified>
        ),
      },
      {
        id: "schema",
        header: t`Schema`,
        minWidth: "auto",
        accessorFn: (row) => row.schemaName,
        cell: ({ row }) => <Ellipsified>{row.original.schemaName}</Ellipsified>,
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance<SuggestedTableRow>({
    data: visibleRows,
    columns,
    getNodeId: (row) => String(row.id),
  });

  const isLoading =
    isLoadingCollections ||
    isLoadingTables ||
    isLoadingDatabases ||
    isLoadingFields;
  const isFiltered =
    trimmedQuery !== "" ||
    filters.databaseId != null ||
    filters.schemaName != null;

  return (
    <SectionLayout>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Published data`}</DataStudioBreadcrumbs>
        }
        tabs={<PublishedDataTabs />}
        px="3.5rem"
        py={0}
        mb="lg"
      />
      <Stack
        bg="background_page-secondary"
        data-testid="suggested-tables-page"
        pb="2rem"
        px="3.5rem"
        style={{ overflow: "hidden" }}
      >
        {!libraryCollection && !isLoadingCollections ? (
          <LibraryEmptyState />
        ) : (
          <>
            <Flex gap="sm">
              <TextInput
                placeholder={t`Search...`}
                leftSection={<Icon name="search" />}
                bdrs="sm"
                flex="1"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {canPublish && (
                <Button
                  size="lg"
                  variant="filled"
                  leftSection={<Icon name="publish" />}
                  disabled={selectedIds.length === 0}
                  onClick={() => setIsPublishModalOpen(true)}
                >
                  {selectedIds.length === 0
                    ? t`Publish`
                    : ngettext(
                        msgid`Publish ${selectedIds.length} table`,
                        `Publish ${selectedIds.length} tables`,
                        selectedIds.length,
                      )}
                </Button>
              )}
              <SuggestedTablesFilter
                rows={suggestedRows}
                filters={filters}
                onChange={setFilters}
              />
            </Flex>
            <Card withBorder p={0}>
              {isLoading ? (
                <TreeTableSkeleton columnWidths={[0.5, 0.25, 0.25]} />
              ) : (
                <TreeTable
                  instance={treeTableInstance}
                  hierarchical={false}
                  showCheckboxes={canPublish}
                  getSelectionState={getSelectionState}
                  onCheckboxClick={onCheckboxClick}
                  onHeaderCheckboxClick={onSelectAllClick}
                  headerCheckboxAriaLabel={t`Select all`}
                  ariaLabel={t`Suggested tables`}
                  emptyState={
                    <ListEmptyState
                      label={
                        isFiltered
                          ? t`No suggested tables match`
                          : t`No suggestions right now. Unpublished tables in each database's final data layer show up here.`
                      }
                      icon={isFiltered ? undefined : "lightbulb"}
                    />
                  }
                  onRowClick={(row) =>
                    navigate(Urls.dataStudioTable(row.original.id))
                  }
                />
              )}
            </Card>
          </>
        )}
      </Stack>
      {isPublishModalOpen && (
        <PublishTablesModal
          isOpened
          tableIds={selectedIds}
          onPublish={() => {
            setIsPublishModalOpen(false);
            clear();
          }}
          onClose={() => setIsPublishModalOpen(false)}
        />
      )}
    </SectionLayout>
  );
}

/**
 * Checkbox selection over the visible rows. Shift-click selects a range,
 * and select all toggles every visible row. Only visible rows count as
 * selected, so hidden or published tables are never acted on.
 */
function useTableSelection(visibleRows: SuggestedTableRow[]) {
  const [selected, setSelected] = useState<ReadonlySet<TableId>>(new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  const selectedIds = useMemo(
    () => visibleRows.map((row) => row.id).filter((id) => selected.has(id)),
    [visibleRows, selected],
  );

  const getSelectionState = useCallback(
    (row: Row<SuggestedTableRow>): SelectionState =>
      selected.has(row.original.id) ? "all" : "none",
    [selected],
  );

  const onCheckboxClick = useCallback(
    (row: Row<SuggestedTableRow>, index: number, event: MouseEvent) => {
      const isSelecting = !selected.has(row.original.id);
      const range =
        event.shiftKey && anchorIndex != null
          ? visibleRows.slice(
              Math.min(anchorIndex, index),
              Math.max(anchorIndex, index) + 1,
            )
          : [row.original];

      setSelected((current) => {
        const next = new Set(current);
        range.forEach(({ id }) =>
          isSelecting ? next.add(id) : next.delete(id),
        );
        return next;
      });
      setAnchorIndex(index);
    },
    [selected, anchorIndex, visibleRows],
  );

  const onSelectAllClick = useCallback(() => {
    const isAllSelected =
      visibleRows.length > 0 && selectedIds.length === visibleRows.length;
    setSelected(
      isAllSelected ? new Set() : new Set(visibleRows.map((row) => row.id)),
    );
    setAnchorIndex(null);
  }, [visibleRows, selectedIds]);

  const clear = useCallback(() => {
    setSelected(new Set());
    setAnchorIndex(null);
  }, []);

  return {
    selectedIds,
    getSelectionState,
    onCheckboxClick,
    onSelectAllClick,
    clear,
  };
}
