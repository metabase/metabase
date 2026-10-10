import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { CollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import {
  CollectionRowModal,
  type CollectionRowModalState,
} from "metabase/common/collections/components/CollectionRowModal";
import { Unauthorized } from "metabase/common/components/ErrorPages";
import { LibraryTreePage } from "metabase/data-studio/common/components/LibraryTreePage";
import { useErrorHandling } from "metabase/data-studio/common/hooks/use-error-handling";
import type { TreeItem } from "metabase/data-studio/common/types";
import { isCollectionData } from "metabase/data-studio/common/utils";
import type { CollectionItemModel } from "metabase-types/api";

import { LibraryEmptyState } from "../../../components/LibraryEmptyState";
import { useCollectionItemsTree } from "../../../hooks/use-collection-items-tree";
import {
  type LibraryCollections,
  useLibraryCollections,
} from "../../../hooks/use-library-collections";
import {
  type LibrarySearchModel,
  useLibrarySearchResults,
} from "../../../hooks/use-library-search-results";
import { CreateLibraryDashboardModal } from "../../components/CreateLibraryDashboardModal";

import { NewDashboardMenu } from "./NewDashboardMenu";

const ITEM_MODELS: CollectionItemModel[] = ["dashboard", "collection"];
const SEARCH_MODELS: LibrarySearchModel[] = ["dashboard"];
const NO_ITEMS: TreeItem[] = [];
// The Dashboards collection's folders and dashboards are the top-level rows
const NO_DEFAULT_EXPANDED_IDS: string[] = [];

export function DashboardsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [collectionModal, setCollectionModal] =
    useState<CollectionRowModalState>();
  const [
    isCreateDashboardModalOpened,
    { open: openCreateDashboardModal, close: closeCreateDashboardModal },
  ] = useDisclosure(false);
  const libraryCollections = useLibraryCollections();
  const { isLoading: isLoadingCollections, dashboardCollection } =
    libraryCollections;
  const {
    items,
    isLoading: isLoadingItems,
    error: itemsError,
    watchRows,
    isChildrenLoading,
  } = useCollectionItemsTree(dashboardCollection, ITEM_MODELS);
  const {
    items: searchItems,
    isActive: isSearchActive,
    isLoading: isSearchLoading,
    error: searchError,
  } = useLibrarySearchResults(
    searchQuery,
    dashboardCollection?.id,
    SEARCH_MODELS,
  );
  useErrorHandling(itemsError || searchError);

  const writableDashboardCollection = dashboardCollection?.can_write
    ? dashboardCollection
    : undefined;
  const defaultMoveCollectionIds = useMemo(
    () => ({ dashboards: dashboardCollection?.id }),
    [dashboardCollection],
  );
  const renderRowMenu = useCallback(
    (item: TreeItem) => (
      <DashboardRowMenu item={item} onOpenModal={setCollectionModal} />
    ),
    [],
  );

  return (
    <LibraryTreePage
      title={t`Dashboards`}
      tree={isSearchActive ? searchItems : (items ?? NO_ITEMS)}
      isLoading={isLoadingCollections || isLoadingItems || isSearchLoading}
      isSearchActive={isSearchActive}
      searchQuery={searchQuery}
      emptyMessage={t`No dashboards yet`}
      defaultExpandedIds={NO_DEFAULT_EXPANDED_IDS}
      defaultMoveCollectionIds={defaultMoveCollectionIds}
      emptyState={getEmptyState(libraryCollections)}
      createMenu={
        writableDashboardCollection && (
          <NewDashboardMenu
            dashboardCollectionId={writableDashboardCollection.id}
            onNewDashboardClick={openCreateDashboardModal}
          />
        )
      }
      renderRowMenu={renderRowMenu}
      isChildrenLoading={isChildrenLoading}
      onRowsChange={watchRows}
      onSearchQueryChange={setSearchQuery}
    >
      <CollectionRowModal
        modal={collectionModal}
        onClose={() => setCollectionModal(undefined)}
      />
      {writableDashboardCollection && (
        <CreateLibraryDashboardModal
          opened={isCreateDashboardModalOpened}
          collectionId={writableDashboardCollection.id}
          onClose={closeCreateDashboardModal}
        />
      )}
    </LibraryTreePage>
  );
}

/**
 * What replaces the list: the offer to create a missing Library, or a
 * permission notice when the user cannot read the Dashboards collection.
 */
function getEmptyState({
  isLoading,
  libraryCollection,
  dashboardCollection,
}: LibraryCollections): ReactNode {
  if (isLoading) {
    return undefined;
  }
  if (libraryCollection == null) {
    return <LibraryEmptyState />;
  }
  // The collection tree leaves out the sections the user cannot read
  if (dashboardCollection == null) {
    return <Unauthorized />;
  }
  return undefined;
}

type DashboardRowMenuProps = {
  item: TreeItem;
  onOpenModal: (modal: CollectionRowModalState) => void;
};

function DashboardRowMenu({
  item: { data },
  onOpenModal,
}: DashboardRowMenuProps) {
  if (!isCollectionData(data)) {
    return null;
  }
  return <CollectionRowMenu collection={data} onOpenModal={onOpenModal} />;
}
