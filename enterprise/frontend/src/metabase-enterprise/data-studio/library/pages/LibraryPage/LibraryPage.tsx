import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  CollectionRowModal,
  type CollectionRowModalState,
} from "metabase/common/collections/components/CollectionRowModal";
import { ForwardRefLink } from "metabase/common/components/Link";
import { trackMetricCreateStarted } from "metabase/common/data-studio/analytics";
import { useHasTokenFeature } from "metabase/common/hooks";
import { canUserCreateQueries } from "metabase/current-user";
import { LibraryTreePage } from "metabase/data-studio/common/components/LibraryTreePage";
import { useErrorHandling } from "metabase/data-studio/common/hooks/use-error-handling";
import type { LibrarySection } from "metabase/data-studio/common/hooks/use-library-bulk-selection";
import type {
  LibrarySectionType,
  TreeItem,
} from "metabase/data-studio/common/types";
import { openNewCollectionModal } from "metabase/data-studio/common/utils";
import { LibraryUpsellPage } from "metabase/data-studio/upsells/pages/LibraryUpsellPage";
import { useDispatch, useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { ActionIcon, Button, Group, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  TableModal,
  type TableModalState,
} from "metabase-enterprise/data-studio/library/tables/components/TableModal";
import type {
  Collection,
  CollectionId,
  CollectionItemModel,
  CollectionNamespace,
} from "metabase-types/api";

import { LibraryEmptyState } from "../../components/LibraryEmptyState";
import { PublishedDataTabs } from "../../components/PublishedDataTabs";
import { LIBRARY_COLLECTION_PICKER_OPTIONS } from "../../constants";
import { useCollectionItemsTree } from "../../hooks/use-collection-items-tree";
import { useHasDataSubfolders } from "../../hooks/use-has-data-subfolders";
import { useLibraryCollections } from "../../hooks/use-library-collections";
import {
  type LibrarySearchModel,
  useLibrarySearchResults,
} from "../../hooks/use-library-search-results";

import { ActionCell } from "./ActionCell";
import { PublishTableModal } from "./PublishTableModal";
import { useMetricOwnerColumns, usePublishedTableColumns } from "./columns";
import {
  getArchiveLibraryCollectionsMessage,
  getWritableCollection,
} from "./utils";

type LibrarySectionPageType = Extract<LibrarySectionType, "data" | "metrics">;

const SECTION_ITEM_MODELS: Record<
  LibrarySectionPageType,
  CollectionItemModel[]
> = {
  data: ["table", "collection"],
  metrics: ["metric", "collection"],
};

const SECTION_SEARCH_MODELS: Record<
  LibrarySectionPageType,
  LibrarySearchModel[]
> = {
  data: ["table"],
  metrics: ["metric"],
};

const NO_ITEMS: TreeItem[] = [];

const LIBRARY_COLLECTION_NAMESPACES: CollectionNamespace[] = [null];

function getTrashMessage(section: LibrarySection, count: number) {
  return section === "data"
    ? getArchiveLibraryCollectionsMessage(count)
    : undefined;
}

/** The published tables in the Library, with their folders */
export function PublishedDataPage() {
  return <GatedLibrarySectionPage section="data" />;
}

/** The metrics in the Library, with their folders */
export function MetricsPage() {
  return <GatedLibrarySectionPage section="metrics" />;
}

function GatedLibrarySectionPage({
  section,
}: {
  section: LibrarySectionPageType;
}) {
  const hasLibraryFeature = useHasTokenFeature("library");

  if (!hasLibraryFeature) {
    return <LibraryUpsellPage />;
  }

  return <LibrarySectionPage section={section} />;
}

function LibrarySectionPage({ section }: { section: LibrarySectionPageType }) {
  const isDataSection = section === "data";
  const [searchQuery, setSearchQuery] = useState("");
  const [collectionModal, setCollectionModal] =
    useState<CollectionRowModalState>();
  const [tableModal, setTableModal] = useState<TableModalState>();
  const [
    showPublishTableModal,
    { open: openPublishTableModal, close: closePublishTableModal },
  ] = useDisclosure(false);
  const navigate = useNavigate();
  const {
    isLoading: isLoadingCollections,
    libraryCollection,
    tableCollection,
    metricCollection,
  } = useLibraryCollections();

  const publishedTableColumns = usePublishedTableColumns({
    isEnabled: isDataSection,
  });
  const metricOwnerColumns = useMetricOwnerColumns({
    isEnabled: !isDataSection,
  });
  const { hasSubfolders: hasDataSubfolders } = useHasDataSubfolders({
    skip: !isDataSection,
  });
  const collection = isDataSection ? tableCollection : metricCollection;
  const writableCollection = useMemo(() => {
    if (isDataSection) {
      return tableCollection?.can_write ? tableCollection : undefined;
    }
    return (
      libraryCollection &&
      getWritableCollection(libraryCollection, "library-metrics")
    );
  }, [isDataSection, libraryCollection, tableCollection]);
  const hasDataAccess = useSelector(canUserCreateQueries);
  const newMetricUrl =
    !isDataSection && hasDataAccess && writableCollection != null
      ? Urls.newDataStudioMetric({ collectionId: writableCollection.id })
      : undefined;

  // The section's own folder stays implicit: its contents are the top rows
  const {
    items: sectionItems,
    isLoading: isLoadingItems,
    error: itemsError,
    watchRows,
    isChildrenLoading,
  } = useCollectionItemsTree(collection, SECTION_ITEM_MODELS[section]);
  const {
    items: searchItems,
    isActive: isSearchActive,
    isLoading: isSearchLoading,
    error: searchError,
  } = useLibrarySearchResults(
    searchQuery,
    collection?.id,
    SECTION_SEARCH_MODELS[section],
  );
  useErrorHandling(itemsError || searchError);
  const defaultMoveCollectionIds = useMemo(
    () => ({ [section]: collection?.id }),
    [section, collection],
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

  const getEmptyAction = (): ReactNode => {
    if (isDataSection) {
      return (
        <Button
          component={ForwardRefLink}
          to={Urls.dataStudioSuggestedTables()}
          variant="filled"
        >
          {t`See suggested tables`}
        </Button>
      );
    }
    return newMetricUrl != null ? (
      <Button
        component={ForwardRefLink}
        to={newMetricUrl}
        variant="filled"
        onClickCapture={() => trackMetricCreateStarted("data_studio_library")}
      >
        {t`Create your first metric`}
      </Button>
    ) : undefined;
  };

  return (
    <LibraryTreePage
      title={isDataSection ? t`Published data` : t`Metrics`}
      tabs={isDataSection ? <PublishedDataTabs /> : undefined}
      tree={isSearchActive ? searchItems : (sectionItems ?? NO_ITEMS)}
      isLoading={isLoadingCollections || isLoadingItems || isSearchLoading}
      isSearchActive={isSearchActive}
      searchQuery={searchQuery}
      emptyMessage={
        isDataSection
          ? t`Publish your final tables so your end users can query and explore them.`
          : t`Metrics are the definitions of your KPIs and most important numbers, which can be broken out and explored by their dimensions.`
      }
      emptyIcon={isDataSection ? "table" : "metric"}
      emptyAction={getEmptyAction()}
      defaultMoveCollectionIds={defaultMoveCollectionIds}
      emptyState={
        !libraryCollection && !isLoadingCollections ? (
          <LibraryEmptyState />
        ) : undefined
      }
      createMenu={
        <SectionCreateActions
          section={section}
          writableCollection={writableCollection}
          newMetricUrl={newMetricUrl}
          onPublishTableClick={openPublishTableModal}
        />
      }
      renderRowMenu={renderRowMenu}
      isChildrenLoading={isChildrenLoading}
      onRowsChange={watchRows}
      onSearchQueryChange={setSearchQuery}
      getTrashMessage={getTrashMessage}
      extraColumns={isDataSection ? publishedTableColumns.columns : undefined}
      trailingColumns={
        isDataSection
          ? publishedTableColumns.trailingColumns
          : metricOwnerColumns
      }
      // Tables can only move between Data and its subfolders
      canMoveItems={!isDataSection || hasDataSubfolders === true}
    >
      {isDataSection && (
        <PublishTableModal
          opened={showPublishTableModal}
          onClose={closePublishTableModal}
          onPublished={(table) => navigate(Urls.dataStudioTable(table.id))}
        />
      )}
      <CollectionRowModal
        modal={collectionModal}
        onClose={() => setCollectionModal(undefined)}
      />
      <TableModal modal={tableModal} onClose={() => setTableModal(undefined)} />
    </LibraryTreePage>
  );
}

type SectionCreateActionsProps = {
  section: LibrarySectionPageType;
  writableCollection: Collection | undefined;
  newMetricUrl: string | undefined;
  onPublishTableClick: () => void;
};

function SectionCreateActions({
  section,
  writableCollection,
  newMetricUrl,
  onPublishTableClick,
}: SectionCreateActionsProps) {
  if (writableCollection == null) {
    return null;
  }

  return (
    <Group gap="sm" wrap="nowrap">
      {section === "data" ? (
        <Button
          size="lg"
          leftSection={<Icon name="publish" />}
          onClick={onPublishTableClick}
        >
          {t`Publish a table`}
        </Button>
      ) : (
        newMetricUrl != null && (
          <Button
            component={ForwardRefLink}
            to={newMetricUrl}
            size="lg"
            leftSection={<Icon name="add" />}
            onClickCapture={() =>
              trackMetricCreateStarted("data_studio_library")
            }
          >
            {t`New`}
          </Button>
        )
      )}
      <NewCollectionButton collectionId={writableCollection.id} />
    </Group>
  );
}

function NewCollectionButton({ collectionId }: { collectionId: CollectionId }) {
  const dispatch = useDispatch();
  const label = t`New collection`;

  const handleClick = () =>
    dispatch(
      openNewCollectionModal({
        initialCollectionId: collectionId,
        namespaces: LIBRARY_COLLECTION_NAMESPACES,
        pickerOptions: LIBRARY_COLLECTION_PICKER_OPTIONS,
      }),
    );

  return (
    <Tooltip label={label}>
      <ActionIcon
        size="lg"
        variant="default"
        aria-label={label}
        onClick={handleClick}
      >
        <Icon name="add_folder" />
      </ActionIcon>
    </Tooltip>
  );
}
