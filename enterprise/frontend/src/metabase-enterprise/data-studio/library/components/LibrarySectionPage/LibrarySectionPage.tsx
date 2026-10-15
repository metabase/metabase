import { useDisclosure } from "@mantine/hooks";
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

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
import type { Collection, CollectionItemModel } from "metabase-types/api";

import { useCollectionItemsTree } from "../../hooks/use-collection-items-tree";
import {
  type LibraryCollections,
  useLibraryCollections,
} from "../../hooks/use-library-collections";
import {
  type LibrarySearchModel,
  useLibrarySearchResults,
} from "../../hooks/use-library-search-results";
import type { LibraryItemModel } from "../../types";
import {
  getAccessibleCollection,
  getLibraryCollectionEmptyStateMessages,
  getLibraryItemSection,
} from "../../utils";
import { LibraryEmptyState } from "../LibraryEmptyState";
import { NewLibraryItemMenu } from "../NewLibraryItemMenu";

import type { LibrarySectionCreateModalProps } from "./types";

type LibrarySectionPageProps = {
  model: LibraryItemModel;
  CreateModal: ComponentType<LibrarySectionCreateModalProps>;
  /** What the bulk trash confirmation says, when the default question is not enough */
  getTrashMessage?: (count: number) => string;
};

const NO_ITEMS: TreeItem[] = [];

export function LibrarySectionPage({
  model,
  CreateModal,
  getTrashMessage,
}: LibrarySectionPageProps) {
  const section = getLibraryItemSection(model);
  const itemModels = useMemo(
    (): CollectionItemModel[] => [model, "collection"],
    [model],
  );
  const searchModels = useMemo((): LibrarySearchModel[] => [model], [model]);
  const [searchQuery, setSearchQuery] = useState("");
  const [collectionModal, setCollectionModal] =
    useState<CollectionRowModalState>();
  const [
    isCreateModalOpened,
    { open: openCreateModal, close: closeCreateModal },
  ] = useDisclosure(false);
  const libraryCollections = useLibraryCollections();
  const sectionCollection =
    libraryCollections.libraryCollection &&
    getAccessibleCollection(libraryCollections.libraryCollection, section.type);
  const {
    items,
    isLoading: isLoadingItems,
    error: itemsError,
    watchRows,
    isChildrenLoading,
  } = useCollectionItemsTree(sectionCollection, itemModels);
  const {
    items: searchItems,
    isActive: isSearchActive,
    isLoading: isSearchLoading,
    error: searchError,
  } = useLibrarySearchResults(searchQuery, sectionCollection?.id, searchModels);
  useErrorHandling(itemsError || searchError);

  const writableSectionCollection = sectionCollection?.can_write
    ? sectionCollection
    : undefined;
  const defaultMoveCollectionIds = useMemo(
    () => ({ [section.key]: sectionCollection?.id }),
    [section.key, sectionCollection],
  );
  const renderRowMenu = useCallback(
    (item: TreeItem) => (
      <SectionRowMenu item={item} onOpenModal={setCollectionModal} />
    ),
    [],
  );

  return (
    <LibraryTreePage
      title={section.getName()}
      tree={isSearchActive ? searchItems : (items ?? NO_ITEMS)}
      isLoading={
        libraryCollections.isLoading || isLoadingItems || isSearchLoading
      }
      isSearchActive={isSearchActive}
      searchQuery={searchQuery}
      emptyMessage={getLibraryCollectionEmptyStateMessages(section.type).title}
      defaultMoveCollectionIds={defaultMoveCollectionIds}
      emptyState={getEmptyState(libraryCollections, sectionCollection)}
      createMenu={
        writableSectionCollection && (
          <NewLibraryItemMenu
            collectionId={writableSectionCollection.id}
            model={model}
            onNewItemClick={openCreateModal}
          />
        )
      }
      pageMenu={{
        label: section.pageMenuLabel,
        permissionsCollection: sectionCollection,
        onOpenModal: setCollectionModal,
      }}
      renderRowMenu={renderRowMenu}
      isChildrenLoading={isChildrenLoading}
      onRowsChange={watchRows}
      onSearchQueryChange={setSearchQuery}
      getTrashMessage={
        getTrashMessage && ((_section, count) => getTrashMessage(count))
      }
    >
      <CollectionRowModal
        modal={collectionModal}
        onClose={() => setCollectionModal(undefined)}
      />
      {writableSectionCollection && (
        <CreateModal
          opened={isCreateModalOpened}
          collectionId={writableSectionCollection.id}
          onClose={closeCreateModal}
        />
      )}
    </LibraryTreePage>
  );
}

function getEmptyState(
  { isLoading, libraryCollection }: LibraryCollections,
  sectionCollection: Collection | undefined,
): ReactNode {
  if (isLoading) {
    return undefined;
  }
  if (libraryCollection == null) {
    return <LibraryEmptyState />;
  }
  // The collection tree leaves out the sections the user cannot read
  if (sectionCollection == null) {
    return <Unauthorized />;
  }
  return undefined;
}

type SectionRowMenuProps = {
  item: TreeItem;
  onOpenModal: (modal: CollectionRowModalState) => void;
};

function SectionRowMenu({ item: { data }, onOpenModal }: SectionRowMenuProps) {
  if (!isCollectionData(data)) {
    return null;
  }
  return <CollectionRowMenu collection={data} onOpenModal={onOpenModal} />;
}
