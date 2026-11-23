import { useDisclosure } from "@mantine/hooks";
import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  CollectionRowModal,
  type CollectionRowModalState,
} from "metabase/common/collections/components/CollectionRowModal";
import { useHasTokenFeature } from "metabase/common/hooks";
import { getUserIsAdmin } from "metabase/current-user";
import { LibraryTreePage } from "metabase/data-studio/common/components/LibraryTreePage";
import { useErrorHandling } from "metabase/data-studio/common/hooks/use-error-handling";
import type { LibrarySection } from "metabase/data-studio/common/hooks/use-library-bulk-selection";
import type { TreeItem } from "metabase/data-studio/common/types";
import { LibraryUpsellPage } from "metabase/data-studio/upsells/pages/LibraryUpsellPage";
import { useSelector } from "metabase/redux";
import {
  TableModal,
  type TableModalState,
} from "metabase-enterprise/data-studio/library/tables/components/TableModal";

import { useLibraryCollections } from "../../hooks/use-library-collections";
import type { LibrarySearchModel } from "../../hooks/use-library-search-results";

import { ActionCell } from "./ActionCell";
import { CreateMenu } from "./CreateMenu";
import { PublishTableModal } from "./PublishTableModal";
import { useLibraryCollectionTree, useLibrarySearch } from "./hooks";
import {
  getArchiveLibraryCollectionsMessage,
  getWritableCollection,
} from "./utils";

const SEARCH_MODELS: LibrarySearchModel[] = ["table", "metric"];
const TABLE_SEARCH_MODELS: LibrarySearchModel[] = ["table"];
const METRIC_SEARCH_MODELS: LibrarySearchModel[] = ["metric"];

/** One Library section on its own page, or both when omitted. */
type LibraryPageSection = Extract<LibrarySection, "data" | "metrics">;

function getTrashMessage(section: LibrarySection, count: number) {
  return section === "data"
    ? getArchiveLibraryCollectionsMessage(count)
    : undefined;
}

export function LibraryPage({ section }: { section?: LibraryPageSection }) {
  const hasLibraryFeature = useHasTokenFeature("library");

  if (!hasLibraryFeature) {
    return <LibraryUpsellPage />;
  }

  return <LibraryPageContent section={section} />;
}

export function LibraryTablesPage() {
  return <LibraryPage section="data" />;
}

export function LibraryMetricsPage() {
  return <LibraryPage section="metrics" />;
}

function LibraryPageContent({ section }: { section?: LibraryPageSection }) {
  const showTables = section !== "metrics";
  const showMetrics = section !== "data";
  const isAdmin = useSelector(getUserIsAdmin);
  const [searchQuery, setSearchQuery] = useState("");
  const [collectionModal, setCollectionModal] =
    useState<CollectionRowModalState>();
  const [tableModal, setTableModal] = useState<TableModalState>();
  const [
    showPublishTableModal,
    { open: openPublishTableModal, close: closePublishTableModal },
  ] = useDisclosure(false);
  const {
    isLoading: isLoadingCollections,
    libraryCollection,
    tableCollection,
    metricCollection,
  } = useLibraryCollections();
  const writableMetricCollection = useMemo(
    () =>
      libraryCollection &&
      getWritableCollection(libraryCollection, "library-metrics"),
    [libraryCollection],
  );

  const {
    tree: tablesTree,
    isLoading: isLoadingTables,
    error: tablesError,
    watchRows: watchTableRows,
    isChildrenLoading: isTableChildrenLoading,
  } = useLibraryCollectionTree(
    showTables ? tableCollection : undefined,
    "data",
  );
  const {
    tree: metricsTree,
    isLoading: isLoadingMetrics,
    error: metricsError,
    watchRows: watchMetricRows,
    isChildrenLoading: isMetricChildrenLoading,
  } = useLibraryCollectionTree(
    showMetrics ? metricCollection : undefined,
    "metrics",
    metricCollection?.id,
  );
  const {
    tree: searchTree,
    isActive: isSearchActive,
    isLoading: isSearchLoading,
  } = useLibrarySearch(
    searchQuery,
    libraryCollection?.id,
    section === "data"
      ? TABLE_SEARCH_MODELS
      : section === "metrics"
        ? METRIC_SEARCH_MODELS
        : SEARCH_MODELS,
  );
  useErrorHandling(tablesError || metricsError);

  // PROTOTYPE: a single section's page (Metrics or Published datasets) lists
  // the section's contents directly, without its own collection as the one
  // row they all sit under; the combined Library page keeps both rows.
  const tree = useMemo(() => {
    if (isSearchActive) {
      return searchTree;
    }
    if (section === "metrics") {
      return metricsTree.flatMap((root) => root.children ?? []);
    }
    if (section === "data") {
      return tablesTree.flatMap((root) => root.children ?? []);
    }
    return [...tablesTree, ...metricsTree];
  }, [isSearchActive, searchTree, tablesTree, metricsTree, section]);
  const defaultExpandedIds = useMemo(
    () =>
      [
        showTables ? tableCollection : undefined,
        showMetrics ? metricCollection : undefined,
      ].flatMap((collection) =>
        collection ? [`collection:${collection.id}`] : [],
      ),
    [tableCollection, metricCollection, showTables, showMetrics],
  );
  const defaultMoveCollectionIds = useMemo(
    () => ({
      data: tableCollection?.id,
      metrics: metricCollection?.id,
    }),
    [tableCollection, metricCollection],
  );
  const emptyStateActions = useMemo(
    () => ({ data: openPublishTableModal }),
    [openPublishTableModal],
  );

  const renderRowMenu = useCallback(
    (item: TreeItem) => (
      <ActionCell
        treeItem={item}
        onOpenCollectionModal={setCollectionModal}
        onOpenTableModal={setTableModal}
      />
    ),
    [],
  );
  const handleRowsChange = useCallback(
    (rows: Row<TreeItem>[]) => {
      watchTableRows(rows);
      watchMetricRows(rows);
    },
    [watchTableRows, watchMetricRows],
  );
  const isChildrenLoading = useCallback(
    (row: Row<TreeItem>) =>
      isTableChildrenLoading(row) || isMetricChildrenLoading(row),
    [isTableChildrenLoading, isMetricChildrenLoading],
  );

  return (
    <LibraryTreePage
      title={
        section === "data"
          ? t`Published datasets`
          : section === "metrics"
            ? t`Metrics`
            : t`Semantic layer`
      }
      tree={tree}
      isLoading={
        isLoadingCollections ||
        isLoadingTables ||
        isLoadingMetrics ||
        isSearchLoading ||
        // Data Studio creates a missing Library for admins; wait for it.
        (isAdmin && !libraryCollection)
      }
      isSearchActive={isSearchActive}
      searchQuery={searchQuery}
      emptyMessage={
        section === "data"
          ? t`No published tables yet`
          : section === "metrics"
            ? t`No metrics yet`
            : t`No tables or metrics yet`
      }
      defaultExpandedIds={defaultExpandedIds}
      defaultMoveCollectionIds={defaultMoveCollectionIds}
      createMenu={
        <CreateMenu
          metricCollectionId={
            showMetrics ? writableMetricCollection?.id : undefined
          }
          canWriteToMetricCollection={showMetrics && !!writableMetricCollection}
          dataCollectionId={showTables ? tableCollection?.id : undefined}
          canWriteToDataCollection={showTables && !!tableCollection?.can_write}
          canPublishTable={showTables}
        />
      }
      emptyStateActions={emptyStateActions}
      renderRowMenu={renderRowMenu}
      isChildrenLoading={isChildrenLoading}
      onRowsChange={handleRowsChange}
      onSearchQueryChange={setSearchQuery}
      getTrashMessage={getTrashMessage}
    >
      <PublishTableModal
        opened={showPublishTableModal}
        onClose={closePublishTableModal}
        onPublished={closePublishTableModal}
      />
      <CollectionRowModal
        modal={collectionModal}
        onClose={() => setCollectionModal(undefined)}
      />
      <TableModal modal={tableModal} onClose={() => setTableModal(undefined)} />
    </LibraryTreePage>
  );
}
