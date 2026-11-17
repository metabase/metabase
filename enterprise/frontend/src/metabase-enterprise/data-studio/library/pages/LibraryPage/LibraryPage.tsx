import { useDisclosure } from "@mantine/hooks";
import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  CollectionRowModal,
  type CollectionRowModalState,
} from "metabase/common/collections/components/CollectionRowModal";
import { useHasTokenFeature } from "metabase/common/hooks";
import { LibraryTreePage } from "metabase/data-studio/common/components/LibraryTreePage";
import { useErrorHandling } from "metabase/data-studio/common/hooks/use-error-handling";
import type { LibrarySection } from "metabase/data-studio/common/hooks/use-library-bulk-selection";
import type { TreeItem } from "metabase/data-studio/common/types";
import { LibraryUpsellPage } from "metabase/data-studio/upsells/pages/LibraryUpsellPage";
import {
  TableModal,
  type TableModalState,
} from "metabase-enterprise/data-studio/library/tables/components/TableModal";

import { LibraryEmptyState } from "../../components/LibraryEmptyState";
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
  } = useLibraryCollectionTree(tableCollection, "data");
  const {
    tree: metricsTree,
    isLoading: isLoadingMetrics,
    error: metricsError,
    watchRows: watchMetricRows,
    isChildrenLoading: isMetricChildrenLoading,
  } = useLibraryCollectionTree(
    metricCollection,
    "metrics",
    metricCollection?.id,
  );
  const {
    tree: searchTree,
    isActive: isSearchActive,
    isLoading: isSearchLoading,
  } = useLibrarySearch(searchQuery, libraryCollection?.id, SEARCH_MODELS);
  useErrorHandling(tablesError || metricsError);

  const tree = useMemo(
    () => (isSearchActive ? searchTree : [...tablesTree, ...metricsTree]),
    [isSearchActive, searchTree, tablesTree, metricsTree],
  );
  const defaultExpandedIds = useMemo(
    () =>
      [tableCollection, metricCollection].flatMap((collection) =>
        collection ? [`collection:${collection.id}`] : [],
      ),
    [tableCollection, metricCollection],
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
      title={t`Semantic layer`}
      tree={tree}
      isLoading={
        isLoadingCollections ||
        isLoadingTables ||
        isLoadingMetrics ||
        isSearchLoading
      }
      isSearchActive={isSearchActive}
      searchQuery={searchQuery}
      emptyMessage={t`No tables or metrics yet`}
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
