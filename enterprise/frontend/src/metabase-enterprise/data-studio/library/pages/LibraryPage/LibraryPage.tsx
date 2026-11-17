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
import { PROTO_NAV_ENABLED } from "metabase/nav/containers/ProtoNavbar/flag";
import { Navigate, useSearchParams } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  TableModal,
  type TableModalState,
} from "metabase-enterprise/data-studio/library/tables/components/TableModal";

import { LibraryEmptyState } from "../../components/LibraryEmptyState";
import { useLibraryCollections } from "../../hooks/use-library-collections";
import type { LibrarySearchModel } from "../../hooks/use-library-search-results";
import { useLibrarySegmentsMeasuresTree } from "../../hooks/use-library-segments-measures-tree";

import { ActionCell } from "./ActionCell";
import { CreateMenu } from "./CreateMenu";
import { PublishTableModal } from "./PublishTableModal";
import { useLibraryCollectionTree, useLibrarySearch } from "./hooks";
import {
  filterTableGroupedTree,
  getArchiveLibraryCollectionsMessage,
  getWritableCollection,
  unwrapSectionRoot,
} from "./utils";

/** The `?library=` filter the prototype nav uses to show one Library section */
type LibrarySectionFilter = "tables" | "metrics" | "segments" | "measures";

const SECTION_FILTERS: LibrarySectionFilter[] = [
  "tables",
  "metrics",
  "segments",
  "measures",
];

const SEARCH_MODELS: LibrarySearchModel[] = ["table", "metric"];
const TABLE_SEARCH_MODELS: LibrarySearchModel[] = ["table"];
const METRIC_SEARCH_MODELS: LibrarySearchModel[] = ["metric"];
const NO_EXPANDED_IDS: string[] = [];

function getTrashMessage(section: LibrarySection, count: number) {
  return section === "data"
    ? getArchiveLibraryCollectionsMessage(count)
    : undefined;
}

function getSectionTitle(section: LibrarySectionFilter | undefined) {
  switch (section) {
    case "tables":
      return t`Published tables`;
    case "metrics":
      return t`Metrics`;
    case "segments":
      return t`Segments`;
    case "measures":
      return t`Measures`;
    default:
      return t`Semantic layer`;
  }
}

function getSectionEmptyMessage(section: LibrarySectionFilter | undefined) {
  switch (section) {
    case "tables":
      return t`No published tables yet`;
    case "metrics":
      return t`No metrics yet`;
    case "segments":
      return t`No segments yet`;
    case "measures":
      return t`No measures yet`;
    default:
      return t`No tables or metrics yet`;
  }
}

export function LibraryPage() {
  const hasLibraryFeature = useHasTokenFeature("library");
  const [searchParams] = useSearchParams();
  const section = SECTION_FILTERS.find(
    (filter) => filter === searchParams.get("library"),
  );

  // The prototype nav links to one Library section at a time, tables by default
  if (PROTO_NAV_ENABLED && section == null) {
    const params = new URLSearchParams(searchParams);
    params.set("library", "tables");
    return (
      <Navigate
        to={`${Urls.dataStudioLibrary()}?${params.toString()}`}
        replace
      />
    );
  }

  if (!hasLibraryFeature) {
    return <LibraryUpsellPage />;
  }

  // Remount per section so search, expansion, and selection start fresh
  return <LibraryPageContent key={section ?? "all"} section={section} />;
}

type LibraryPageContentProps = {
  section: LibrarySectionFilter | undefined;
};

function LibraryPageContent({ section }: LibraryPageContentProps) {
  const segmentsOrMeasures =
    section === "segments" || section === "measures" ? section : null;
  const isTableGroupedView = segmentsOrMeasures != null;
  const showsTables = section == null || section === "tables";
  const showsMetrics = section == null || section === "metrics";

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
    showsTables ? tableCollection : undefined,
    "data",
  );
  const {
    tree: metricsTree,
    isLoading: isLoadingMetrics,
    error: metricsError,
    watchRows: watchMetricRows,
    isChildrenLoading: isMetricChildrenLoading,
  } = useLibraryCollectionTree(
    showsMetrics ? metricCollection : undefined,
    "metrics",
    metricCollection?.id,
  );
  const {
    tree: searchTree,
    isActive: isSearchActive,
    isLoading: isSearchLoading,
  } = useLibrarySearch(
    isTableGroupedView ? "" : searchQuery,
    libraryCollection?.id,
    section === "tables"
      ? TABLE_SEARCH_MODELS
      : section === "metrics"
        ? METRIC_SEARCH_MODELS
        : SEARCH_MODELS,
  );
  const { tree: tableGroupedTree, isLoading: isLoadingTableGroupedTree } =
    useLibrarySegmentsMeasuresTree(segmentsOrMeasures);
  useErrorHandling(tablesError || metricsError);

  const tree = useMemo(() => {
    if (isTableGroupedView) {
      return filterTableGroupedTree(tableGroupedTree, searchQuery);
    }
    if (section === "tables" || section === "metrics") {
      const sectionTree = section === "tables" ? tablesTree : metricsTree;
      return unwrapSectionRoot(isSearchActive ? searchTree : sectionTree);
    }
    return isSearchActive ? searchTree : [...tablesTree, ...metricsTree];
  }, [
    isTableGroupedView,
    tableGroupedTree,
    searchQuery,
    section,
    isSearchActive,
    searchTree,
    tablesTree,
    metricsTree,
  ]);
  const defaultExpandedIds = useMemo(() => {
    if (isTableGroupedView) {
      return tableGroupedTree.map((node) => node.id);
    }
    if (section != null) {
      return NO_EXPANDED_IDS;
    }
    return [tableCollection, metricCollection].flatMap((collection) =>
      collection ? [`collection:${collection.id}`] : [],
    );
  }, [
    isTableGroupedView,
    tableGroupedTree,
    section,
    tableCollection,
    metricCollection,
  ]);
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
    (item: TreeItem) =>
      isTableGroupedView ||
      item.model === "segment" ||
      item.model === "measure" ? null : (
        <ActionCell
          treeItem={item}
          onOpenCollectionModal={setCollectionModal}
          onOpenTableModal={setTableModal}
        />
      ),
    [isTableGroupedView],
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
      title={getSectionTitle(section)}
      tree={tree}
      isLoading={
        isTableGroupedView
          ? isLoadingTableGroupedTree
          : isLoadingCollections ||
            isLoadingTables ||
            isLoadingMetrics ||
            isSearchLoading
      }
      isSearchActive={
        isTableGroupedView ? searchQuery.trim().length > 0 : isSearchActive
      }
      searchQuery={searchQuery}
      emptyMessage={getSectionEmptyMessage(section)}
      defaultExpandedIds={defaultExpandedIds}
      defaultMoveCollectionIds={defaultMoveCollectionIds}
      emptyState={
        !libraryCollection && !isLoadingCollections && !isTableGroupedView ? (
          <LibraryEmptyState
            section={section === "metrics" ? "metrics" : "tables"}
            onPublishTable={openPublishTableModal}
          />
        ) : undefined
      }
      showCheckboxes={!isTableGroupedView}
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
