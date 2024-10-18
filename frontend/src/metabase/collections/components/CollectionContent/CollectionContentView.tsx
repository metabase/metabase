import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { usePrevious } from "react-use";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { deletePermanently } from "metabase/archive/actions";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import { CollectionBulkActions } from "metabase/collections/components/CollectionBulkActions";
import PinnedItemOverview from "metabase/collections/components/PinnedItemOverview";
import Header from "metabase/collections/containers/CollectionHeader";
import type {
  CreateBookmark,
  DeleteBookmark,
  OnFileUpload,
  UploadFile,
} from "metabase/collections/types";
import {
  isPersonalCollectionChild,
  isRootTrashCollection,
  isTrashedCollection,
} from "metabase/collections/utils";
import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";
import Bookmarks from "metabase/entities/bookmarks";
import Collections from "metabase/entities/collections";
import Search from "metabase/entities/search";
import { useListSelect } from "metabase/hooks/use-list-select";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionId,
  CollectionItem,
} from "metabase-types/api";

import type { CollectionOrTableIdProps } from "../ModelUploadModal";
import { ModelUploadModal } from "../ModelUploadModal";
import UploadOverlay from "../UploadOverlay";

import { CollectionMain, CollectionRoot } from "./CollectionContent.styled";
import { CollectionItemsTable } from "./CollectionItemsTable";
import { getComposedDragProps } from "./utils";

const itemKeyFn = (item: CollectionItem) => `${item.id}:${item.model}`;

export const CollectionContentView = ({
  databases,
  bookmarks,
  collection,
  collections: collectionList = [],
  collectionId,
  createBookmark,
  deleteBookmark,
  isAdmin,
  uploadFile,
  uploadsEnabled,
  canCreateUploadInDb,
}: {
  databases?: Database[];
  bookmarks?: Bookmark[];
  collection: Collection;
  collections: Collection[];
  collectionId: CollectionId;
  createBookmark: CreateBookmark;
  deleteBookmark: DeleteBookmark;
  isAdmin: boolean;
  uploadFile: UploadFile;
  uploadsEnabled: boolean;
  canCreateUploadInDb: boolean;
}) => {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [selectedItems, setSelectedItems] = useState<CollectionItem[] | null>(
    null,
  );
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const [
    isModelUploadModalOpen,
    { turnOn: openModelUploadModal, turnOff: closeModelUploadModal },
  ] = useToggle(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const saveFile = (file: File) => {
    setUploadedFile(file);
    openModelUploadModal();
  };

  const handleUploadFile = useCallback<OnFileUpload>(
    (uploadFileArgs: CollectionOrTableIdProps) => {
      const { collectionId, tableId } = uploadFileArgs;
      if (uploadedFile && (collectionId || tableId)) {
        closeModelUploadModal();
        uploadFile({
          file: uploadedFile,
          ...uploadFileArgs,
        });
      }
    },
    [uploadFile, uploadedFile, closeModelUploadModal],
  );

  const { clear, getIsSelected, selected, selectOnlyTheseItems, toggleItem } =
    useListSelect(itemKeyFn);
  const previousCollection = usePrevious(collection);

  useEffect(() => {
    if (previousCollection && previousCollection.id !== collection.id) {
      clear();
    }
  }, [previousCollection, collection, clear]);

  useEffect(() => {
    const shouldBeBookmarked = !!bookmarks?.some(
      bookmark =>
        bookmark.type === "collection" && bookmark.item_id === collectionId,
    );
    setIsBookmarked(shouldBeBookmarked);
  }, [bookmarks, collectionId]);

  const dispatch = useDispatch();

  const onDrop = (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) {
      dispatch(
        addUndo({
          message: t`Invalid file type`,
          toastColor: "error",
          icon: "warning",
        }),
      );
      return;
    }
    saveFile(acceptedFiles[0]);
  };

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    noClick: true,
    noDragEventsBubbling: true,
    accept: { "text/csv": [".csv"], "text/tab-separated-values": [".tsv"] },
  });

  const handleMove = (selectedItems: CollectionItem[]) => {
    setSelectedItems(selectedItems);
    setSelectedAction("move");
  };

  const handleCopy = (selectedItems: CollectionItem[]) => {
    setSelectedItems(selectedItems);
    setSelectedAction("copy");
  };

  const handleCreateBookmark = () => {
    createBookmark(collectionId.toString(), "collection");
  };

  const handleDeleteBookmark = () => {
    deleteBookmark(collectionId.toString(), "collection");
  };

  const canCreateUpload =
    canCreateUploadInDb &&
    collection.can_write &&
    !isTrashedCollection(collection);

  const dropzoneProps = canCreateUpload
    ? getComposedDragProps(getRootProps())
    : {};

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
      {({
        list,
        loading: loadingPinnedItems,
      }: {
        list: CollectionItem[];
        loading: boolean;
      }) => {
        const pinnedItems =
          list && !isRootTrashCollection(collection) ? list : [];
        const hasPinnedItems = pinnedItems.length > 0;
        const actionId = { id: collectionId };

        return (
          <CollectionRoot {...dropzoneProps}>
            {canCreateUpload && (
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

            {collection.archived && (
              <ArchivedEntityBanner
                name={collection.name}
                entityType="collection"
                canMove={collection.can_write}
                canRestore={collection.can_restore}
                canDelete={collection.can_delete}
                onUnarchive={async () => {
                  const input = { ...actionId, name: collection.name };
                  await dispatch(Collections.actions.setArchived(input, false));
                  await dispatch(Bookmarks.actions.invalidateLists());
                }}
                onMove={({ id }) =>
                  dispatch(Collections.actions.setCollection(actionId, { id }))
                }
                onDeletePermanently={() =>
                  dispatch(
                    deletePermanently(Collections.actions.delete(actionId)),
                  )
                }
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
                  canUpload={canCreateUpload}
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
                />
              </ErrorBoundary>
              <ErrorBoundary>
                <CollectionItemsTable
                  collectionId={collectionId}
                  collection={collection}
                  getIsSelected={getIsSelected}
                  selectOnlyTheseItems={selectOnlyTheseItems}
                  databases={databases}
                  bookmarks={bookmarks}
                  createBookmark={createBookmark}
                  deleteBookmark={deleteBookmark}
                  loadingPinnedItems={loadingPinnedItems}
                  hasPinnedItems={hasPinnedItems}
                  selected={selected}
                  toggleItem={toggleItem}
                  clear={clear}
                  handleMove={handleMove}
                  handleCopy={handleCopy}
                />
                <CollectionBulkActions
                  collection={collection}
                  selected={selected}
                  clearSelected={clear}
                  selectedItems={selectedItems}
                  setSelectedItems={setSelectedItems}
                  selectedAction={selectedAction}
                  setSelectedAction={setSelectedAction}
                />
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
};
