import { useForceUpdate } from "@mantine/hooks";
import type { Location } from "history";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { usePrevious, useUnmount } from "react-use";
import useBeforeUnload from "react-use/lib/useBeforeUnload";
import { t } from "ttag";

import {
  useCopyDocumentMutation,
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useListBookmarksQuery,
} from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import {
  LeaveConfirmModal,
  LeaveRouteConfirmModal,
} from "metabase/common/components/LeaveConfirmModal";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch, useSelector } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import { Box } from "metabase/ui";
import { extractEntityId } from "metabase/urls";
import * as Urls from "metabase/urls";

import {
  trackDocumentBookmark,
  trackDocumentDuplicated,
  trackDocumentUnsavedChangesWarningDisplayed,
} from "../analytics";
import {
  openVizSettingsSidebar,
  resetDocuments,
  setChildTargetId,
  setHasUnsavedChanges,
  setIsHistorySidebarOpen,
} from "../documents.slice";
import { useDocumentEditor } from "../hooks/use-document-editor";
import { useScrollToAnchor } from "../hooks/use-scroll-to-anchor";
import {
  getIsHistorySidebarOpen,
  getSelectedEmbedIndex,
  getSelectedQuestionId,
} from "../selectors";

import { DocumentArchivedEntityBanner } from "./DocumentArchivedEntityBanner";
import { DocumentHeader } from "./DocumentHeader";
import styles from "./DocumentPage.module.css";
import { DocumentRevisionHistorySidebar } from "./DocumentRevisionHistorySidebar";
import { Editor } from "./Editor";
import { EmbedQuestionSettingsSidebar } from "./EmbedQuestionSettingsSidebar";

export const DocumentPage = ({
  params,
  route,
  location,
  children,
}: {
  params: {
    entityId?: string;
    childTargetId?: string;
  };
  location: Location;
  route: Route;
  children?: ReactNode;
}) => {
  const { entityId, childTargetId: paramsChildTargetId } = params;
  const documentId = entityId === "new" ? "new" : extractEntityId(entityId);
  const {
    editorInstance,
    setEditorInstance,
    collectionPickerMode,
    setCollectionPickerMode,
    isNavigationScheduled,
    scheduleNavigation,
    isNewDocument,
    isSaving,
    documentData,
    isDocumentLoading,
    error,
    canWrite,
    documentTitle,
    setDocumentTitle,
    documentContent,
    setDocumentContent,
    updateCardEmbeds,
    hasUnsavedChanges,
    showSaveButton,
    handleSave,
    handleUpdate,
    handleChange,
  } = useDocumentEditor({
    documentId,
  });
  const previousLocationKey = usePrevious(location.key);
  const forceUpdate = useForceUpdate();
  const dispatch = useDispatch();
  const selectedQuestionId = useSelector(getSelectedQuestionId);
  const selectedEmbedIndex = useSelector(getSelectedEmbedIndex);
  const isHistorySidebarOpen = useSelector(getIsHistorySidebarOpen);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [copyDocument] = useCopyDocumentMutation();
  const [duplicateModalMode, setDuplicateModalMode] = useState<
    "duplicate" | "leave" | null
  >(null);

  const { data: bookmarks = [] } = useListBookmarksQuery(undefined, {
    skip: isNewDocument,
  });
  const [createBookmark] = useCreateBookmarkMutation();
  const [deleteBookmark] = useDeleteBookmarkMutation();

  const isBookmarked = Boolean(
    bookmarks.find(
      ({ type, item_id }) => type === "document" && item_id === documentId,
    ),
  );

  useEffect(() => {
    if (error) {
      dispatch(setErrorPage(error));
    }
  }, [dispatch, error]);

  // This is important as it will affect collection breadcrumbs in the appbar
  useUnmount(() => {
    dispatch(resetDocuments());
  });

  useBeforeUnload(() => {
    // warn if you try to navigate away with unsaved changes
    return hasUnsavedChanges();
  });

  // Reset state when we navigate back to /new
  const resetDocument = useCallback(() => {
    setDocumentTitle("");
    setDocumentContent(null);
    dispatch(setHasUnsavedChanges(false));
    editorInstance?.commands.clearContent();
    editorInstance?.commands.focus();
    dispatch(resetDocuments());
  }, [dispatch, editorInstance, setDocumentContent, setDocumentTitle]);

  useEffect(() => {
    dispatch(setChildTargetId(paramsChildTargetId));
  }, [dispatch, paramsChildTargetId]);

  // Scroll to anchor block when navigating with URL hash
  const blockId = location.hash ? location.hash.slice(1) : null;
  useScrollToAnchor({
    blockId,
    editorContainerRef,
    isLoading: isDocumentLoading,
  });

  const handleDuplicate = useCallback(() => {
    if (hasUnsavedChanges()) {
      setDuplicateModalMode("leave");
      return;
    }
    setDuplicateModalMode("duplicate");
  }, [hasUnsavedChanges]);

  const handleToggleBookmark = useCallback(() => {
    if (!documentId) {
      return;
    }

    if (!isBookmarked) {
      trackDocumentBookmark();
    }

    if (isBookmarked) {
      deleteBookmark({ type: "document", id: documentId });
    } else {
      createBookmark({ type: "document", id: documentId });
    }
  }, [isBookmarked, deleteBookmark, createBookmark, documentId]);

  const handleShowHistory = useCallback(() => {
    dispatch(setIsHistorySidebarOpen(true));
  }, [dispatch]);

  const focusEditorBody = useCallback(() => {
    editorInstance?.commands.focus("start");
  }, [editorInstance]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Save shortcut: Cmd+S (Mac) or Ctrl+S (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        if (!hasUnsavedChanges() || !canWrite) {
          return;
        }

        if (isNewDocument) {
          setCollectionPickerMode("save");
        } else {
          handleSave();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    hasUnsavedChanges,
    handleSave,
    isNewDocument,
    setCollectionPickerMode,
    canWrite,
  ]);

  const handleQuestionSelect = useCallback(
    (cardId: number | null, embedIndex?: number | null) => {
      if (
        cardId !== null &&
        embedIndex !== null &&
        embedIndex !== undefined &&
        embedIndex >= 0 &&
        selectedEmbedIndex !== null
      ) {
        // Only update the selected embed index if the sidebar is already open
        dispatch(openVizSettingsSidebar({ embedIndex }));
      }
    },
    [dispatch, selectedEmbedIndex],
  );

  usePageTitle(documentData?.name || t`New document`, { titleIndex: 1 });

  const isLeaveConfirmModalOpen = useMemo(
    () =>
      hasUnsavedChanges() &&
      isNewDocument &&
      location.key !== previousLocationKey,
    [hasUnsavedChanges, isNewDocument, location.key, previousLocationKey],
  );

  useEffect(() => {
    if (isLeaveConfirmModalOpen) {
      trackDocumentUnsavedChangesWarningDisplayed(documentData);
    }
  }, [isLeaveConfirmModalOpen, documentData]);

  return (
    <Box className={styles.documentPage}>
      {documentData?.archived && <DocumentArchivedEntityBanner />}
      <Box className={styles.contentArea}>
        <Box className={styles.mainContent}>
          <Box className={styles.documentContainer}>
            <DocumentHeader
              document={documentData}
              documentTitle={documentTitle}
              isNewDocument={isNewDocument}
              canWrite={canWrite ?? false}
              showSaveButton={showSaveButton ?? false}
              isBookmarked={isBookmarked}
              onTitleChange={setDocumentTitle}
              onTitleSubmit={focusEditorBody}
              onSave={() => {
                if (isNewDocument) {
                  setCollectionPickerMode("save");
                } else {
                  handleSave();
                }
              }}
              onMove={() => setCollectionPickerMode("move")}
              onDuplicate={handleDuplicate}
              onToggleBookmark={handleToggleBookmark}
              onArchive={() => handleUpdate({ archived: true })}
              onShowHistory={handleShowHistory}
            />
            <Editor
              onEditorReady={setEditorInstance}
              onCardEmbedsChange={updateCardEmbeds}
              onQuestionSelect={handleQuestionSelect}
              initialContent={documentContent}
              onChange={handleChange}
              editable={canWrite && !isSaving}
              isLoading={isDocumentLoading}
              editorContainerRef={editorContainerRef}
            />
          </Box>
        </Box>

        {selectedQuestionId &&
          selectedEmbedIndex !== null &&
          editorInstance && (
            <Box className={styles.sidebar} data-testid="document-card-sidebar">
              <EmbedQuestionSettingsSidebar
                cardId={selectedQuestionId}
                editorInstance={editorInstance}
              />
            </Box>
          )}

        {collectionPickerMode && (
          <CollectionPickerModal
            title={t`Where should we save this document?`}
            onClose={() => setCollectionPickerMode(null)}
            entityType="document"
            onChange={(collection) => {
              if (collectionPickerMode === "save") {
                handleSave(canonicalCollectionId(collection.id));
                setCollectionPickerMode(null);
              } else if (collectionPickerMode === "move") {
                handleUpdate({
                  collection_id: canonicalCollectionId(collection.id),
                });
              }
            }}
          />
        )}

        {duplicateModalMode === "duplicate" && documentData && (
          <EntityCopyModal
            entityType="documents"
            onClose={() => setDuplicateModalMode(null)}
            onSaved={(document) => {
              setDuplicateModalMode(null);
              scheduleNavigation(() => {
                dispatch(push(Urls.document(document)));
              });
            }}
            entityObject={documentData}
            title={t`Duplicate "${documentData?.name}"`}
            overwriteOnInitialValuesChange
            copy={async (object) => {
              if (!documentData?.id) {
                throw new Error(
                  "Cannot duplicate document that has not been saved",
                );
              }

              const response = await copyDocument({
                ...object,
                id: documentData.id,
              });

              if (!response.data) {
                throw (
                  response.error ?? new Error("Failed to duplicate document")
                );
              }

              const _document = response.data;
              trackDocumentDuplicated(_document);
              return _document;
            }}
          />
        )}

        {children}

        <LeaveRouteConfirmModal
          // `key` remounts this modal when navigating between different documents or to a new document.
          // The `route` doesn't change in that scenario which prevents the modal from closing when you confirm you want to discard your changes.
          key={location.key}
          isEnabled={hasUnsavedChanges() && !isNavigationScheduled}
          route={route}
          onOpenChange={(open) => {
            if (open) {
              trackDocumentUnsavedChangesWarningDisplayed(documentData);
            }
          }}
        />

        <LeaveConfirmModal
          // only applies when going from /new -> /new
          opened={isLeaveConfirmModalOpen}
          onConfirm={resetDocument}
          onClose={() => forceUpdate()}
        />

        <ConfirmModal
          // only applies when trying to duplicate a document that has unsaved changes
          opened={duplicateModalMode === "leave"}
          confirmButtonText={t`Save changes`}
          confirmButtonProps={{ color: "brand" }}
          data-testid="save-confirmation"
          message={t`You need to save before you can duplicate this document.`}
          title={t`Save your changes first`}
          onConfirm={async () => {
            if ((await handleSave())?.error) {
              throw new Error("Failed to save document");
            }
            setDuplicateModalMode("duplicate");
          }}
          onClose={() => setDuplicateModalMode(null)}
        />
      </Box>
      {isHistorySidebarOpen && documentData && (
        <Box className={styles.sidebar} data-testid="document-history-sidebar">
          <DocumentRevisionHistorySidebar
            document={documentData}
            onClose={() => dispatch(setIsHistorySidebarOpen(false))}
          />
        </Box>
      )}
    </Box>
  );
};
