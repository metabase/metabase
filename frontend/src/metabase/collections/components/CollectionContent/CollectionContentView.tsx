import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { usePrevious } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  Api,
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useDeleteCollectionMutation,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import { useSetArchive } from "metabase/archive/hooks";
import { CollectionBulkActions } from "metabase/collections/components/CollectionBulkActions";
import { CollectionHeader } from "metabase/collections/components/CollectionHeader";
import { PinnedItemsGrid } from "metabase/collections/components/PinnedItemsGrid";
import {
  trackCollectionBookmarked,
  trackCollectionSelectModeEntered,
} from "metabase/common/collections/analytics";
import { getComposedDragProps } from "metabase/common/collections/dropzone";
import type {
  CollectionOrTableIdProps,
  OnFileUpload,
} from "metabase/common/collections/types";
import { isTrashedCollection } from "metabase/common/collections/utils";
import { ItemsDragLayer } from "metabase/common/components/dnd/ItemsDragLayer";
import { useSetCollection, useToast } from "metabase/common/hooks";
import { useListSelect } from "metabase/common/hooks/use-list-select";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import {
  MAX_UPLOAD_SIZE,
  MAX_UPLOAD_STRING,
  uploadFile as uploadFileAction,
} from "metabase/redux/uploads";
import { useNavigate } from "metabase/router";
import { Box } from "metabase/ui";
import type {
  Bookmark,
  Collection,
  CollectionId,
  CollectionItem,
  Database,
} from "metabase-types/api";

import { ModelUploadModal } from "../ModelUploadModal";
import UploadOverlay from "../UploadOverlay";

import S from "./CollectionContent.module.css";
import { CollectionItemsTable } from "./CollectionItemsTable";
import { useCollectionChartPaste } from "./use-collection-chart-paste";

const itemKeyFn = (item: CollectionItem) => `${item.id}:${item.model}`;

export const CollectionContentView = ({
  databases,
  bookmarks,
  collection,
  collectionId,
  isAdmin,
  uploadsEnabled,
  canCreateUploadInDb,
}: {
  databases?: Database[];
  bookmarks?: Bookmark[];
  collection: Collection;
  collectionId: CollectionId;
  isAdmin: boolean;
  uploadsEnabled: boolean;
  canCreateUploadInDb: boolean;
}) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [deleteCollection] = useDeleteCollectionMutation();
  const [createBookmark] = useCreateBookmarkMutation();
  const [deleteBookmark] = useDeleteBookmarkMutation();
  const archive = useSetArchive();
  const setCollection = useSetCollection();
  const [sendToast] = useToast();

  useCollectionChartPaste(collection);

  const isBookmarked =
    bookmarks?.some(
      (bookmark) =>
        bookmark.type === "collection" && bookmark.item_id === collectionId,
    ) ?? false;

  const [selectedItems, setSelectedItems] = useState<CollectionItem[] | null>(
    null,
  );
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const [
    isModelUploadModalOpen,
    { open: openModelUploadModal, close: closeModelUploadModal },
  ] = useDisclosure(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const { clear, getIsSelected, selected, selectOnlyTheseItems, toggleItem } =
    useListSelect(itemKeyFn);
  const previousCollection = usePrevious(collection);
  const previousSelectedCount = usePrevious(selected.length);

  useEffect(() => {
    if (previousCollection && previousCollection.id !== collection.id) {
      clear();
    }
  }, [previousCollection, collection, clear]);

  useEffect(() => {
    if (previousSelectedCount === 0 && selected.length > 0) {
      trackCollectionSelectModeEntered(collectionId);
    }
  }, [collectionId, previousSelectedCount, selected.length]);

  const saveFile = useCallback(
    (file: File) => {
      setUploadedFile(file);
      openModelUploadModal();
    },
    [openModelUploadModal],
  );

  const handleUploadFile = useCallback<OnFileUpload>(
    (uploadFileArgs: CollectionOrTableIdProps) => {
      const { collectionId, tableId } = uploadFileArgs;
      if (uploadedFile && (collectionId || tableId)) {
        closeModelUploadModal();
        dispatch(uploadFileAction({ file: uploadedFile, ...uploadFileArgs }));
      }
    },
    [dispatch, uploadedFile, closeModelUploadModal],
  );

  const handleFileRejections = useCallback(
    (rejected: FileRejection[]) => {
      if (!rejected.length) {
        return;
      }

      if (rejected.length > 1) {
        sendToast({
          message: t`Please upload files individually`,
          toastColor: "feedback-negative",
          icon: "warning",
        });
        return;
      }

      const errorCode = rejected[0].errors[0].code;

      const errorMessage = match(errorCode)
        .with(
          "file-invalid-type",
          () => t`Sorry, this file type is not supported`,
        )
        .with(
          "file-too-large",
          () => t`Sorry, this file is too large (max ${MAX_UPLOAD_STRING} MB)`,
        )
        .otherwise(() => t`An error has occurred`);

      sendToast({
        message: errorMessage,
        toastColor: "feedback-negative",
        icon: "warning",
      });
    },
    [sendToast],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (fileRejections.length) {
        handleFileRejections(fileRejections);
      } else if (acceptedFiles.length === 1) {
        saveFile(acceptedFiles[0]);
      }
    },
    [handleFileRejections, saveFile],
  );

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: MAX_UPLOAD_SIZE,
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
    createBookmark({ id: collectionId, type: "collection" });
    trackCollectionBookmarked();
  };

  const handleDeleteBookmark = () => {
    deleteBookmark({ id: collectionId, type: "collection" });
  };

  const canCreateUpload =
    canCreateUploadInDb &&
    collection.can_write &&
    !isTrashedCollection(collection);

  const dropzoneProps = canCreateUpload
    ? getComposedDragProps(getRootProps())
    : {};

  return (
    <Box
      className={S.root}
      h="100%"
      pos="relative"
      bg="background_page-secondary"
      {...dropzoneProps}
    >
      {canCreateUpload && (
        <>
          <ModelUploadModal
            collectionId={collectionId}
            opened={isModelUploadModalOpen}
            onClose={closeModelUploadModal}
            onUpload={handleUploadFile}
          />
          <UploadOverlay isDragActive={isDragActive} collection={collection} />
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
            await archive({ id: collectionId, model: "collection" }, false);
            dispatch(Api.util.invalidateTags([listTag("bookmark")]));
          }}
          onMove={({ id }) =>
            setCollection({ model: "collection", id: collectionId }, { id })
          }
          onDeletePermanently={async () => {
            try {
              await deleteCollection({ id: collectionId }).unwrap();
              navigate("/trash");
              dispatch(
                addUndo({
                  message: t`This item has been permanently deleted.`,
                }),
              );
            } catch {
              dispatch(
                addUndo({
                  message: t`There was an error permanently deleting this item.`,
                }),
              );
            }
          }}
        />
      )}

      <Box className={S.main} mx="auto" mah="100%" px="5%" py="lg">
        <ErrorBoundary>
          <CollectionHeader
            collection={collection}
            isAdmin={isAdmin}
            isBookmarked={isBookmarked}
            onCreateBookmark={handleCreateBookmark}
            onDeleteBookmark={handleDeleteBookmark}
            canUpload={canCreateUpload}
            uploadsEnabled={uploadsEnabled}
            onSaveFile={saveFile}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <PinnedItemsGrid
            databases={databases}
            bookmarks={bookmarks}
            createBookmark={createBookmark}
            deleteBookmark={deleteBookmark}
            collectionId={collectionId}
            collection={collection}
            onMove={handleMove}
            onCopy={handleCopy}
            selected={selected}
            getIsSelected={getIsSelected}
            onToggleSelected={toggleItem}
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
            showFilterBar
            selected={selected}
            toggleItem={toggleItem}
            clear={clear}
            handleMove={handleMove}
            handleCopy={handleCopy}
          />
          <CollectionBulkActions
            collection={collection}
            bookmarks={bookmarks}
            selected={selected}
            clearSelected={clear}
            selectedItems={selectedItems}
            setSelectedItems={setSelectedItems}
            selectedAction={selectedAction}
            setSelectedAction={setSelectedAction}
          />
        </ErrorBoundary>
      </Box>
      <ItemsDragLayer />
    </Box>
  );
};
