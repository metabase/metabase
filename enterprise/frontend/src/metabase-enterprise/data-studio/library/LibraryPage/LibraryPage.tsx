import { useDisclosure } from "@mantine/hooks";
import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { useHasTokenFeature } from "metabase/common/hooks";
import {
  LibraryTreePage,
  useErrorHandling,
} from "metabase/data-studio/common/components/LibraryTreePage";
import type { LibrarySection } from "metabase/data-studio/common/hooks/use-library-bulk-selection";
import type { TreeItem } from "metabase/data-studio/common/types";
import { LibraryUpsellPage } from "metabase/data-studio/upsells/pages";
import type { CollectionId } from "metabase-types/api";

import { LibraryEmptyState } from "../components/LibraryEmptyState";

import { ActionCell } from "./components/ActionCell";
import { CreateLibraryDashboardModal } from "./components/CreateLibraryDashboardModal";
import { CreateMenu } from "./components/CreateMenu";
import { PublishTableModal } from "./components/PublishTableModal";
import {
  useLibraryCollectionTree,
  useLibraryCollections,
  useLibrarySearch,
} from "./hooks";
import type { LibrarySearchModel } from "./hooks/use-library-search";
import {
  getArchiveLibraryCollectionsMessage,
  getWritableCollection,
} from "./utils";

const SEARCH_MODELS: LibrarySearchModel[] = ["table", "metric", "dashboard"];

function getTrashMessage(section: LibrarySection, count: number) {
  return section === "data"
    ? getArchiveLibraryCollectionsMessage(count)
    : undefined;
}

export function LibraryPage() {
  const hasLibraryFeature = useHasTokenFeature("library");

  if (!hasLibraryFeature) {
    return <LibraryUpsellPage />;
  }

  return <LibraryPageContent />;
}

function LibraryPageContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [
    showPublishTableModal,
    { open: openPublishTableModal, close: closePublishTableModal },
  ] = useDisclosure(false);
  const [
    showCreateDashboardModal,
    { open: openCreateDashboardModal, close: closeCreateDashboardModal },
  ] = useDisclosure(false);
  const { data: collections = [], isLoading: isLoadingCollections } =
    useListCollectionsTreeQuery({
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      "include-library": true,
    });
  const {
    libraryCollection,
    tableCollection,
    metricCollection,
    dashboardCollection,
  } = useLibraryCollections(collections);
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
    refreshCollections: refreshTableCollections,
  } = useLibraryCollectionTree(tableCollection, "data");
  const {
    tree: metricsTree,
    isLoading: isLoadingMetrics,
    error: metricsError,
    watchRows: watchMetricRows,
    isChildrenLoading: isMetricChildrenLoading,
    refreshCollections: refreshMetricCollections,
  } = useLibraryCollectionTree(
    metricCollection,
    "metrics",
    metricCollection?.id,
  );
  const {
    tree: dashboardsTree,
    isLoading: isLoadingDashboards,
    error: dashboardsError,
    watchRows: watchDashboardRows,
    isChildrenLoading: isDashboardChildrenLoading,
    refreshCollections: refreshDashboardCollections,
  } = useLibraryCollectionTree(dashboardCollection, "dashboards");
  const {
    tree: searchTree,
    isActive: isSearchActive,
    isLoading: isSearchLoading,
  } = useLibrarySearch(searchQuery, libraryCollection?.id, SEARCH_MODELS);
  useErrorHandling(tablesError || metricsError || dashboardsError);

  const tree = useMemo(
    () =>
      isSearchActive
        ? searchTree
        : [...tablesTree, ...metricsTree, ...dashboardsTree],
    [isSearchActive, searchTree, tablesTree, metricsTree, dashboardsTree],
  );
  const defaultExpandedIds = useMemo(
    () =>
      [tableCollection, metricCollection, dashboardCollection].flatMap(
        (collection) => (collection ? [`collection:${collection.id}`] : []),
      ),
    [tableCollection, metricCollection, dashboardCollection],
  );
  const defaultMoveCollectionIds = useMemo(
    () => ({
      data: tableCollection?.id,
      metrics: metricCollection?.id,
      dashboards: dashboardCollection?.id,
    }),
    [tableCollection, metricCollection, dashboardCollection],
  );
  const emptyStateActions = useMemo(
    () => ({
      data: openPublishTableModal,
      dashboards: openCreateDashboardModal,
    }),
    [openPublishTableModal, openCreateDashboardModal],
  );

  const refreshSection = useCallback(
    (section: LibrarySection, collectionIds: CollectionId[]) => {
      if (section === "data") {
        refreshTableCollections(collectionIds);
      } else if (section === "metrics") {
        refreshMetricCollections(collectionIds);
      } else if (section === "dashboards") {
        refreshDashboardCollections(collectionIds);
      }
    },
    [
      refreshTableCollections,
      refreshMetricCollections,
      refreshDashboardCollections,
    ],
  );
  const renderRowMenu = useCallback(
    (item: TreeItem) => (
      <ActionCell treeItem={item} refreshSection={refreshSection} />
    ),
    [refreshSection],
  );
  const handleRowsChange = useCallback(
    (rows: Row<TreeItem>[]) => {
      watchTableRows(rows);
      watchMetricRows(rows);
      watchDashboardRows(rows);
    },
    [watchTableRows, watchMetricRows, watchDashboardRows],
  );
  const isChildrenLoading = useCallback(
    (row: Row<TreeItem>) =>
      isTableChildrenLoading(row) ||
      isMetricChildrenLoading(row) ||
      isDashboardChildrenLoading(row),
    [
      isTableChildrenLoading,
      isMetricChildrenLoading,
      isDashboardChildrenLoading,
    ],
  );

  return (
    <LibraryTreePage
      title={t`Semantic layer`}
      tree={tree}
      isLoading={
        isLoadingCollections ||
        isLoadingTables ||
        isLoadingMetrics ||
        isLoadingDashboards ||
        isSearchLoading
      }
      isSearchActive={isSearchActive}
      searchQuery={searchQuery}
      emptyMessage={t`No tables, metrics, or dashboards yet`}
      defaultExpandedIds={defaultExpandedIds}
      defaultMoveCollectionIds={defaultMoveCollectionIds}
      emptyState={
        !libraryCollection && !isLoadingCollections ? (
          <LibraryEmptyState />
        ) : undefined
      }
      createMenu={
        <CreateMenu
          metricCollectionId={writableMetricCollection?.id}
          canWriteToMetricCollection={!!writableMetricCollection}
          dataCollectionId={tableCollection?.id}
          canWriteToDataCollection={!!tableCollection?.can_write}
          dashboardCollectionId={dashboardCollection?.id}
          canWriteToDashboardCollection={!!dashboardCollection?.can_write}
          onNewDashboardClick={openCreateDashboardModal}
        />
      }
      emptyStateActions={emptyStateActions}
      renderRowMenu={renderRowMenu}
      isChildrenLoading={isChildrenLoading}
      onRowsChange={handleRowsChange}
      onSearchQueryChange={setSearchQuery}
      getTrashMessage={getTrashMessage}
      onBulkActionComplete={refreshSection}
    >
      <PublishTableModal
        opened={showPublishTableModal}
        onClose={closePublishTableModal}
        onPublished={closePublishTableModal}
      />
      {dashboardCollection && (
        <CreateLibraryDashboardModal
          opened={showCreateDashboardModal}
          collectionId={dashboardCollection.id}
          onClose={closeCreateDashboardModal}
        />
      )}
    </LibraryTreePage>
  );
}
