import { useForceUpdate } from "@mantine/hooks";
import type { JSONContent, Editor as TiptapEditor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import dayjs from "dayjs";
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
import { push, replace } from "react-router-redux";
import { usePrevious, useUnmount } from "react-use";
import useBeforeUnload from "react-use/lib/useBeforeUnload";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useCopyDocumentMutation,
  useCreateBookmarkMutation,
  useCreateDocumentMutation,
  useDeleteBookmarkMutation,
  useGetDocumentQuery,
  useListBookmarksQuery,
  useListCommentsQuery,
  useUpdateDocumentMutation,
} from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import {
  LeaveConfirmModal,
  LeaveRouteConfirmModal,
} from "metabase/common/components/LeaveConfirmModal";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useToast } from "metabase/common/hooks";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { extractEntityId } from "metabase/lib/urls";
import * as Urls from "metabase/lib/urls";
import { setErrorPage } from "metabase/redux/app";
import { Box } from "metabase/ui";
import type {
  Card,
  CollectionId,
  RegularCollectionId,
} from "metabase-types/api";

import {
  trackDocumentBookmark,
  trackDocumentCreated,
  trackDocumentDuplicated,
  trackDocumentUnsavedChangesWarningDisplayed,
  trackDocumentUpdated,
} from "../analytics";
import {
  clearDraftCards,
  openVizSettingsSidebar,
  resetDocuments,
  setChildTargetId,
  setCurrentDocument,
  setHasUnsavedChanges,
  setIsHistorySidebarOpen,
} from "../documents.slice";
import { useDocumentState } from "../hooks/use-document-state";
import { useRegisterDocumentMetabotContext } from "../hooks/use-register-document-metabot-context";
import { useScrollToAnchor } from "../hooks/use-scroll-to-anchor";
import {
  getDraftCards,
  getHasUnsavedChanges,
  getIsHistorySidebarOpen,
  getSelectedEmbedIndex,
  getSelectedQuestionId,
} from "../selectors";
import { getListCommentsQuery } from "../utils/api";

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
  const previousLocationKey = usePrevious(location.key);
  const forceUpdate = useForceUpdate();
  const dispatch = useDispatch();
  const selectedQuestionId = useSelector(getSelectedQuestionId);
  const selectedEmbedIndex = useSelector(getSelectedEmbedIndex);
  const draftCards = useSelector(getDraftCards);
  const isHistorySidebarOpen = useSelector(getIsHistorySidebarOpen);
  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(
    null,
  );
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const hasUnsavedEditorChanges = useSelector(getHasUnsavedChanges);
  const [createDocument, { isLoading: isCreating }] =
    useCreateDocumentMutation();
  const [updateDocument, { isLoading: isUpdating }] =
    useUpdateDocumentMutation();
  const [copyDocument] = useCopyDocumentMutation();
  const [collectionPickerMode, setCollectionPickerMode] = useState<
    "save" | "move" | null
  >(null);
  const [duplicateModalMode, setDuplicateModalMode] = useState<
    "duplicate" | "leave" | null
  >(null);
  const [sendToast] = useToast();

  const documentId = entityId === "new" ? "new" : extractEntityId(entityId);
  const [isNavigationScheduled, scheduleNavigation] = useCallbackEffect();
  const isNewDocument = documentId === "new";

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

  let {
    data: documentData,
    isLoading: isDocumentLoading,
    error,
  } = useGetDocumentQuery(
    documentId && !isNewDocument ? { id: documentId } : skipToken,
  );
  if (documentId !== documentData?.id) {
    documentData = undefined;
  }

  const { data: commentsData } = useListCommentsQuery(
    getListCommentsQuery(documentData),
  );
  const hasComments =
    !!commentsData?.comments && commentsData.comments.length > 0;

  const canWrite =
    !documentData?.archived && (isNewDocument || documentData?.can_write);

  useEffect(() => {
    if (error) {
      dispatch(setErrorPage(error));
    }
  }, [dispatch, error]);

  const {
    documentTitle,
    setDocumentTitle,
    documentContent,
    setDocumentContent,
    updateCardEmbeds,
  } = useDocumentState(documentData);

  // This is important as it will affect collection breadcrumbs in the appbar
  useUnmount(() => {
    dispatch(resetDocuments());
  });

  useRegisterDocumentMetabotContext();
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

  // Reset dirty state when document content loads from API
  useEffect(() => {
    if (documentContent && !isNewDocument) {
      dispatch(setHasUnsavedChanges(false));
    }
  }, [dispatch, documentContent, isNewDocument]);

  useEffect(() => {
    // Set current document when document loads (includes collection_id and all other data)
    if (documentData && !isNewDocument) {
      dispatch(setCurrentDocument(documentData));
    } else if (isNewDocument) {
      dispatch(setCurrentDocument(null));
    }
  }, [documentData, documentId, dispatch, isNewDocument]);

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

  const hasUnsavedChanges = useCallback(() => {
    const currentTitle = documentTitle.trim();
    const originalTitle = documentData?.name || "";
    // We call .trim() on documentTitle to ensure that no one can push the save button
    // with a document name that is all whitespace, the API will reject it. However,
    // when comparing saved with current titles, we need to use unmofidied values
    const titleChanged = documentTitle !== originalTitle;

    // Check if there are any draft cards
    const hasDraftCards = Object.keys(draftCards).length > 0;

    // For new documents, show Save if there's title or editor changes or draft cards
    if (isNewDocument) {
      return (
        currentTitle.length > 0 || hasUnsavedEditorChanges || hasDraftCards
      );
    }

    // For existing documents, use simple change tracking
    return titleChanged || hasUnsavedEditorChanges || hasDraftCards;
  }, [
    documentTitle,
    isNewDocument,
    documentData,
    hasUnsavedEditorChanges,
    draftCards,
  ]);

  const isSaving = isCreating || isUpdating;
  const showSaveButton = hasUnsavedChanges() && canWrite && !isSaving;

  const handleChange = useCallback(
    (content: JSONContent) => {
      // For new documents, any content means changes
      if (isNewDocument) {
        // when navigating to `/new`, handleChange is fired but the editor instance hasn't been set yet
        dispatch(
          setHasUnsavedChanges(!!editorInstance && !editorInstance.isEmpty),
        );
        return;
      }

      // Compare current content with original content
      const currentContent = content;
      const originalContent = documentContent;

      // For existing documents, compare with original content
      const hasChanges = !_.isEqual(currentContent, originalContent);
      dispatch(setHasUnsavedChanges(hasChanges));
    },
    [dispatch, editorInstance, documentContent, isNewDocument],
  );

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

    isBookmarked
      ? deleteBookmark({ type: "document", id: documentId })
      : createBookmark({ type: "document", id: documentId });
  }, [isBookmarked, deleteBookmark, createBookmark, documentId]);

  const handleShowHistory = useCallback(() => {
    dispatch(setIsHistorySidebarOpen(true));
  }, [dispatch]);

  const handleSave = useCallback(
    async (collectionId: RegularCollectionId | null = null) => {
      if (!editorInstance || isSaving) {
        return;
      }

      try {
        const cardsToSave: Record<number, Card> = {};
        const processedCardIds = new Set<number>();

        editorInstance.state.doc.descendants((node: ProseMirrorNode) => {
          if (node.type.name === "cardEmbed") {
            const cardId = node.attrs.id;
            if (!processedCardIds.has(cardId)) {
              processedCardIds.add(cardId);

              if (cardId < 0 && draftCards[cardId]) {
                cardsToSave[cardId] = draftCards[cardId];
              }
            }
          }
        });

        const documentAst = editorInstance.getJSON();
        const name =
          documentTitle ||
          t`Untitled document - ${dayjs().local().format("MMMM D, YYYY")}`;

        const newDocumentData = {
          name,
          document: documentAst,
          cards: Object.keys(cardsToSave).length > 0 ? cardsToSave : undefined,
        };

        const result = await (documentData?.id
          ? updateDocument({ ...newDocumentData, id: documentData.id }).then(
              (response) => {
                if (response.data) {
                  const _document = response.data;
                  trackDocumentUpdated(_document);
                  scheduleNavigation(() => {
                    dispatch(push(Urls.document(_document)));
                  });
                }
                return response;
              },
            )
          : createDocument({
              ...newDocumentData,
              collection_id: collectionId || undefined,
            }).then((response) => {
              if (response.data) {
                const _document = response.data;
                trackDocumentCreated(_document);
                scheduleNavigation(() => {
                  dispatch(replace(Urls.document(_document)));
                });
              }
              return response;
            }));

        if (result.data) {
          sendToast({
            message: documentData?.id ? t`Document saved` : t`Document created`,
          });
          dispatch(clearDraftCards());
          // Mark document as clean
          dispatch(setHasUnsavedChanges(false));
          return {
            document: result.data,
          };
        } else if (result.error) {
          throw result.error;
        }
      } catch (error) {
        console.error("Failed to save document:", error);
        sendToast({ message: t`Error saving document`, icon: "warning" });
        return {
          error: error,
        };
      }
    },
    [
      editorInstance,
      isSaving,
      documentTitle,
      draftCards,
      documentData?.id,
      updateDocument,
      createDocument,
      scheduleNavigation,
      dispatch,
      sendToast,
    ],
  );

  const focusEditorBody = useCallback(() => {
    editorInstance?.commands.focus("start");
  }, [editorInstance]);

  const handleUpdate = async (payload: {
    collection_id?: CollectionId | null;
    archived?: boolean;
  }) => {
    if (documentData?.id) {
      await updateDocument({ id: documentData.id, ...payload });
      setCollectionPickerMode(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Save shortcut: Cmd+S (Mac) or Ctrl+S (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        if (!hasUnsavedChanges() || !canWrite) {
          return;
        }

        isNewDocument ? setCollectionPickerMode("save") : handleSave();
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
              hasComments={hasComments}
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
            options={{
              showPersonalCollections: true,
              showRootCollection: true,
            }}
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

        {duplicateModalMode === "duplicate" && (
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

              return await copyDocument({
                ...object,
                id: documentData.id,
              }).then((response) => {
                if (response.data) {
                  const _document = response.data;
                  trackDocumentDuplicated(_document);
                  return _document;
                } else if (response.error) {
                  throw response.error;
                }
              });
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
