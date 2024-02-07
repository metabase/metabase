/* eslint-disable react/prop-types */
import { useEffect, useState, useCallback } from "react";
import _ from "underscore";
import { useDropzone } from "react-dropzone";
import { usePrevious } from "react-use";

import { useSelector, useDispatch } from "metabase/lib/redux";
import {
  useCollectionQuery,
  useCollectionListQuery,
  useDatabaseListQuery,
  useBookmarkListQuery,
} from "metabase/common/hooks";

import { useToggle } from "metabase/hooks/use-toggle";
import Bookmark from "metabase/entities/bookmarks";
import Search from "metabase/entities/search";

import { getUserIsAdmin } from "metabase/selectors/user";
import { getSetting } from "metabase/selectors/settings";
import { getIsNavbarOpen } from "metabase/selectors/app";

import ErrorBoundary from "metabase/ErrorBoundary";
import BulkActions from "metabase/collections/components/BulkActions";
import CollectionEmptyState from "metabase/collections/components/CollectionEmptyState";
import Header from "metabase/collections/containers/CollectionHeader";
import ItemsTable from "metabase/collections/components/ItemsTable";
import PinnedItemOverview from "metabase/collections/components/PinnedItemOverview";
import { isPersonalCollectionChild } from "metabase/collections/utils";
import { uploadFile as uploadFileAction } from "metabase/redux/uploads";

import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";
import PaginationControls from "metabase/components/PaginationControls";

import { usePagination } from "metabase/hooks/use-pagination";
import { useListSelect } from "metabase/hooks/use-list-select";
import Databases from "metabase/entities/databases";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import UploadOverlay from "../components/UploadOverlay";
import { ModelUploadModal } from "../components/ModelUploadModal";
import { getComposedDragProps } from "./utils";

import {
  CollectionEmptyContent,
  CollectionMain,
  CollectionRoot,
  CollectionTable,
} from "./CollectionContent.styled";

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

function CollectionContentView({
  databases,
  bookmarks,
  collection,
  collections: collectionList = [],
  collectionId,
  createBookmark,
  deleteBookmark,
  isAdmin,
  isNavbarOpen,
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

  const [
    isModelUploadModalOpen,
    { turnOn: openModelUploadModal, turnOff: closeModelUploadModal },
  ] = useToggle(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  const saveFile = file => {
    setUploadedFile(file);
    openModelUploadModal();
  };

  const handleUploadFile = useCallback(
    ({ collectionId, tableId, modelId }) => {
      if (uploadedFile && (collectionId || tableId)) {
        closeModelUploadModal();
        uploadFile({ file: uploadedFile, collectionId, tableId, modelId });
      }
    },
    [uploadFile, uploadedFile, closeModelUploadModal],
  );

  const { handleNextPage, handlePreviousPage, setPage, page, resetPage } =
    usePagination();
  const { clear, getIsSelected, selected, selectOnlyTheseItems, toggleItem } =
    useListSelect(itemKeyFn);
  const previousCollection = usePrevious(collection);

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

  const onDrop = acceptedFiles => {
    saveFile(acceptedFiles[0]);
  };

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
              <>
                <ModelUploadModal
                  collectionId={collectionId}
                  opened={isModelUploadModalOpen}
                  onClose={closeModelUploadModal}
                  onUpload={handleUploadFile}
                />
                <UploadOverlay
                  isDragActive={isDragActive}
                  collection={collection}
                />
              </>
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
                  saveFile={saveFile}
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

export function CollectionContent({ collectionId }) {
  const { data: bookmarks, error: bookmarksError } = useBookmarkListQuery();
  const { data: databases, error: databasesError } = useDatabaseListQuery();
  const { data: collections, error: collectionsError } = useCollectionListQuery(
    {
      query: {
        tree: true,
        "exclude-other-user-collections": true,
        "exclude-archived": true,
      },
    },
  );
  const { data: collection, error: collectionError } = useCollectionQuery({
    id: collectionId,
  });

  const uploadDbId = useSelector(state =>
    getSetting(state, "uploads-database-id"),
  );
  const uploadsEnabled = useSelector(state =>
    getSetting(state, "uploads-enabled"),
  );

  const canUploadToDb = useSelector(
    state =>
      uploadDbId &&
      Databases.selectors
        .getObject(state, {
          entityId: uploadDbId,
        })
        ?.canUpload(),
  );

  const isAdmin = useSelector(getUserIsAdmin);
  const isNavbarOpen = useSelector(getIsNavbarOpen);

  const dispatch = useDispatch();

  const createBookmark = (id, type) =>
    dispatch(Bookmark.actions.create({ id, type }));
  const deleteBookmark = (id, type) =>
    dispatch(Bookmark.actions.delete({ id, type }));

  const uploadFile = dispatch(uploadFileAction);

  if (!bookmarks || !databases || !collections || !collection) {
    return <LoadingAndErrorWrapper loading />;
  }

  const error =
    bookmarksError || databasesError || collectionsError || collectionError;
  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  return (
    <CollectionContentView
      databases={databases}
      bookmarks={bookmarks}
      collection={collection}
      collections={collections}
      collectionId={collectionId}
      createBookmark={createBookmark}
      deleteBookmark={deleteBookmark}
      isAdmin={isAdmin}
      isNavbarOpen={isNavbarOpen}
      uploadFile={uploadFile}
      uploadsEnabled={uploadsEnabled}
      canUploadToDb={canUploadToDb}
    />
  );
}
