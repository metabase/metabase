/* eslint-disable react/prop-types */
import { useEffect, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { connect } from "react-redux";
import { usePrevious, useMount } from "react-use";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import BulkActions from "metabase/collections/components/BulkActions";
import CollectionEmptyState from "metabase/collections/components/CollectionEmptyState";
import ItemsTable from "metabase/collections/components/ItemsTable";
import PinnedItemOverview from "metabase/collections/components/PinnedItemOverview";
import Header from "metabase/collections/containers/CollectionHeader";
import { getIsBookmarked } from "metabase/collections/selectors";
import { isPersonalCollectionChild } from "metabase/collections/utils";
import PaginationControls from "metabase/components/PaginationControls";
import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";
import Bookmark from "metabase/entities/bookmarks";
import Collection from "metabase/entities/collections";
import Databases from "metabase/entities/databases";
import Search from "metabase/entities/search";
import { useListSelect } from "metabase/hooks/use-list-select";
import { usePagination } from "metabase/hooks/use-pagination";
import { isSmallScreen } from "metabase/lib/dom";
import { openNavbar } from "metabase/redux/app";
import { uploadFile } from "metabase/redux/uploads";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

import UploadOverlay from "../components/UploadOverlay";

import {
  CollectionEmptyContent,
  CollectionMain,
  CollectionRoot,
  CollectionTable,
} from "./CollectionContent.styled";
import { getComposedDragProps } from "./utils";

const PAGE_SIZE = 25;

const ALL_MODELS = [
  "dashboard",
  "dataset",
  "card",
  "snippet",
  "pulse",
  "collection",
];

const itemKeyFn = item => `${item.id}:${item.model}`;

function mapStateToProps(state, props) {
  const uploadDbId = getSetting(state, "uploads-database-id");
  const uploadsEnabled = getSetting(state, "uploads-enabled");
  const canUploadToDb =
    uploadDbId &&
    Databases.selectors
      .getObject(state, {
        entityId: uploadDbId,
      })
      ?.canUpload();

  return {
    isAdmin: getUserIsAdmin(state),
    isBookmarked: getIsBookmarked(state, props),
    isNavbarOpen: getIsNavbarOpen(state),
    uploadsEnabled,
    canUploadToDb,
  };
}

const mapDispatchToProps = {
  openNavbar,
  createBookmark: (id, type) => Bookmark.actions.create({ id, type }),
  deleteBookmark: (id, type) => Bookmark.actions.delete({ id, type }),
  uploadFile,
};

function CollectionContent({
  databases,
  bookmarks,
  collection,
  collections: collectionList = [],
  collectionId,
  createBookmark,
  deleteBookmark,
  isAdmin,
  isNavbarOpen,
  openNavbar,
  uploadFile,
  uploadsEnabled,
  canUploadToDb,
}) {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [selectedItems, setSelectedItems] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null);
  const [unpinnedItemsSorting, setUnpinnedItemsSorting] = useState({
    sort_column: "name",
    sort_direction: "asc",
  });
  const { handleNextPage, handlePreviousPage, setPage, page, resetPage } =
    usePagination();
  const { clear, getIsSelected, selected, selectOnlyTheseItems, toggleItem } =
    useListSelect(itemKeyFn);
  const previousCollection = usePrevious(collection);

  useMount(() => {
    if (!isSmallScreen()) {
      openNavbar();
    }
  });

  useEffect(() => {
    if (previousCollection && previousCollection.id !== collection.id) {
      clear();
      resetPage();
    }
  }, [previousCollection, collection, clear, resetPage]);

  useEffect(() => {
    const shouldBeBookmarked = bookmarks.some(
      bookmark =>
        bookmark.type === "collection" && bookmark.item_id === collectionId,
    );

    setIsBookmarked(shouldBeBookmarked);
  }, [bookmarks, collectionId]);

  const onDrop = useCallback(
    acceptedFiles => {
      uploadFile(acceptedFiles[0], collectionId);
    },
    [collectionId, uploadFile],
  );

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    noClick: true,
    noDragEventsBubbling: true,
    accept: { "text/csv": [".csv"] },
  });

  const handleBulkArchive = useCallback(async () => {
    try {
      await Promise.all(selected.map(item => item.setArchived(true)));
    } finally {
      clear();
    }
  }, [selected, clear]);

  const handleBulkMoveStart = () => {
    setSelectedItems(selected);
    setSelectedAction("move");
  };

  const handleBulkMove = useCallback(
    async collection => {
      try {
        await Promise.all(
          selectedItems.map(item => item.setCollection(collection)),
        );
        handleCloseModal();
      } finally {
        clear();
      }
    },
    [selectedItems, clear],
  );

  const handleUnpinnedItemsSortingChange = useCallback(
    sortingOpts => {
      setUnpinnedItemsSorting(sortingOpts);
      setPage(0);
    },
    [setPage],
  );

  const handleCloseModal = () => {
    setSelectedItems(null);
    setSelectedAction(null);
  };

  const handleMove = selectedItems => {
    setSelectedItems(selectedItems);
    setSelectedAction("move");
  };

  const handleCopy = selectedItems => {
    setSelectedItems(selectedItems);
    setSelectedAction("copy");
  };

  const handleCopyToAnotherWorkspace = selectedDashboards => {
    const messageData = {
      pipelines: {
        type: "DashboardTransfer",
        payload: {
          selectedDashboards,
        },
      },
    };
    window.parent.postMessage(messageData, "*");
  };

  const handleCreateBookmark = () => {
    createBookmark(collectionId, "collection");
  };

  const handleDeleteBookmark = () => {
    deleteBookmark(collectionId, "collection");
  };

  const canUpload = uploadsEnabled && canUploadToDb && collection.can_write;

  const dropzoneProps = canUpload ? getComposedDragProps(getRootProps()) : {};

  const unpinnedQuery = {
    collection: collectionId,
    models: ALL_MODELS,
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
    pinned_state: "is_not_pinned",
    ...unpinnedItemsSorting,
  };

  const pinnedQuery = {
    collection: collectionId,
    pinned_state: "is_pinned",
    sort_column: "name",
    sort_direction: "asc",
  };

  return (
    <Search.ListLoader
      query={pinnedQuery}
      loadingAndErrorWrapper={false}
      keepListWhileLoading
      wrapped
    >
      {({ list: pinnedItems = [], loading: loadingPinnedItems }) => {
        const hasPinnedItems = pinnedItems.length > 0;

        return (
          <CollectionRoot {...dropzoneProps}>
            {canUpload && (
              <UploadOverlay
                isDragActive={isDragActive}
                collection={collection}
              />
            )}
            <CollectionMain>
              <ErrorBoundary>
                <Header
                  collection={collection}
                  isAdmin={isAdmin}
                  isBookmarked={isBookmarked}
                  isPersonalCollectionChild={isPersonalCollectionChild(
                    collection,
                    collectionList,
                  )}
                  onCreateBookmark={handleCreateBookmark}
                  onDeleteBookmark={handleDeleteBookmark}
                  canUpload={canUpload}
                  uploadsEnabled={uploadsEnabled}
                />
              </ErrorBoundary>
              <ErrorBoundary>
                <PinnedItemOverview
                  databases={databases}
                  bookmarks={bookmarks}
                  createBookmark={createBookmark}
                  deleteBookmark={deleteBookmark}
                  items={pinnedItems}
                  collection={collection}
                  onMove={handleMove}
                  onCopy={handleCopy}
                  onCopyToAnotherWorkspace={handleCopyToAnotherWorkspace}
                  onToggleSelected={toggleItem}
                />
              </ErrorBoundary>
              <ErrorBoundary>
                <Search.ListLoader
                  query={unpinnedQuery}
                  loadingAndErrorWrapper={false}
                  keepListWhileLoading
                  wrapped
                >
                  {({
                    list: unpinnedItems = [],
                    metadata = {},
                    loading: loadingUnpinnedItems,
                  }) => {
                    const hasPagination = metadata.total > PAGE_SIZE;

                    const unselected = unpinnedItems.filter(
                      item => !getIsSelected(item),
                    );
                    const hasUnselected = unselected.length > 0;

                    const handleSelectAll = () => {
                      selectOnlyTheseItems(unpinnedItems);
                    };

                    const loading = loadingPinnedItems || loadingUnpinnedItems;
                    const isEmpty =
                      !loading && !hasPinnedItems && unpinnedItems.length === 0;

                    if (isEmpty && !loadingUnpinnedItems) {
                      return (
                        <CollectionEmptyContent>
                          <CollectionEmptyState collection={collection} />
                        </CollectionEmptyContent>
                      );
                    }

                    return (
                      <CollectionTable data-testid="collection-table">
                        <ItemsTable
                          databases={databases}
                          bookmarks={bookmarks}
                          createBookmark={createBookmark}
                          deleteBookmark={deleteBookmark}
                          items={unpinnedItems}
                          collection={collection}
                          sortingOptions={unpinnedItemsSorting}
                          onSortingOptionsChange={
                            handleUnpinnedItemsSortingChange
                          }
                          selectedItems={selected}
                          hasUnselected={hasUnselected}
                          getIsSelected={getIsSelected}
                          onToggleSelected={toggleItem}
                          onDrop={clear}
                          onMove={handleMove}
                          onCopy={handleCopy}
                          onCopyToAnotherWorkspace={
                            handleCopyToAnotherWorkspace
                          }
                          onSelectAll={handleSelectAll}
                          onSelectNone={clear}
                        />
                        <div className="flex justify-end my3">
                          {hasPagination && (
                            <PaginationControls
                              showTotal
                              page={page}
                              pageSize={PAGE_SIZE}
                              total={metadata.total}
                              itemsLength={unpinnedItems.length}
                              onNextPage={handleNextPage}
                              onPreviousPage={handlePreviousPage}
                            />
                          )}
                        </div>
                        <BulkActions
                          selected={selected}
                          collection={collection}
                          onArchive={handleBulkArchive}
                          onMoveStart={handleBulkMoveStart}
                          onMove={handleBulkMove}
                          onCloseModal={handleCloseModal}
                          onCopy={clear}
                          onCopyToAnotherWorkspace={
                            handleCopyToAnotherWorkspace
                          }
                          selectedItems={selectedItems}
                          selectedAction={selectedAction}
                          isNavbarOpen={isNavbarOpen}
                        />
                      </CollectionTable>
                    );
                  }}
                </Search.ListLoader>
              </ErrorBoundary>
            </CollectionMain>
            <ItemsDragLayer
              selectedItems={selected}
              pinnedItems={pinnedItems}
              collection={collection}
            />
          </CollectionRoot>
        );
      }}
    </Search.ListLoader>
  );
}

export default _.compose(
  Bookmark.loadList(),
  Databases.loadList(),
  Collection.loadList({
    query: {
      tree: true,
      "exclude-other-user-collections": true,
      "exclude-archived": true,
    },
    loadingAndErrorWrapper: false,
  }),
  Collection.load({
    id: (_, props) => props.collectionId,
    reload: true,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionContent);
