import { useForceUpdate } from "@mantine/hooks";
import type { JSONContent, Editor as TiptapEditor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import cx from "classnames";
import dayjs from "dayjs";
import type { Location } from "history";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { Route } from "react-router";
import { push, replace } from "react-router-redux";
import { usePrevious, useUnmount } from "react-use";
import useBeforeUnload from "react-use/lib/useBeforeUnload";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useListBookmarksQuery,
} from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import {
  LeaveConfirmModal,
  LeaveRouteConfirmModal,
} from "metabase/common/components/LeaveConfirmModal";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useToast } from "metabase/common/hooks";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { SetTitle } from "metabase/hoc/Title";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { extractEntityId } from "metabase/lib/urls";
import { setErrorPage } from "metabase/redux/app";
import { Box } from "metabase/ui";
import {
  useCreateDocumentMutation,
  useGetDocumentQuery,
  useListCommentsQuery,
  useUpdateDocumentMutation,
} from "metabase-enterprise/api";
import type {
  Card,
  CollectionId,
  RegularCollectionId,
} from "metabase-types/api";

import { trackDocumentCreated, trackDocumentUpdated } from "../analytics";
import {
  clearDraftCards,
  openVizSettingsSidebar,
  resetDocuments,
  setChildTargetId,
  setCurrentDocument,
  setHasUnsavedChanges,
} from "../documents.slice";
import { useDocumentState } from "../hooks/use-document-state";
import { useRegisterDocumentMetabotContext } from "../hooks/use-register-document-metabot-context";
import {
  getCommentSidebarOpen,
  getDraftCards,
  getHasUnsavedChanges,
  getSelectedEmbedIndex,
  getSelectedQuestionId,
} from "../selectors";
import { getListCommentsQuery } from "../utils/api";

import { DocumentArchivedEntityBanner } from "./DocumentArchivedEntityBanner";
import { DocumentHeader } from "./DocumentHeader";
import styles from "./DocumentPage.module.css";
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
  const commentSidebarOpen = useSelector(getCommentSidebarOpen);
  const draftCards = useSelector(getDraftCards);
  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(
    null,
  );
  const hasUnsavedEditorChanges = useSelector(getHasUnsavedChanges);
  const [createDocument, { isLoading: isCreating }] =
    useCreateDocumentMutation();
  const [updateDocument, { isLoading: isUpdating }] =
    useUpdateDocumentMutation();
  const [collectionPickerMode, setCollectionPickerMode] = useState<
    "save" | "move" | null
  >(null);
  const [sendToast] = useToast();

  const documentId = entityId === "new" ? "new" : extractEntityId(entityId);
  const previousDocumentId = usePrevious(documentId);
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
    (isNewDocument || documentData?.can_write) && !commentSidebarOpen;

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

  // Reset state when document changes
  useEffect(() => {
    if (documentId !== previousDocumentId) {
      dispatch(setHasUnsavedChanges(false));
      if (isNewDocument && previousDocumentId !== "new") {
        setDocumentTitle("");
        setDocumentContent(null);
        dispatch(resetDocuments());
      }
    }
  }, [
    documentId,
    previousDocumentId,
    isNewDocument,
    setDocumentTitle,
    setDocumentContent,
    dispatch,
  ]);

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

  const hasUnsavedChanges = useCallback(() => {
    const currentTitle = documentTitle.trim();
    const originalTitle = documentData?.name || "";
    const titleChanged = currentTitle !== originalTitle;

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
      console.log({ content });
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

  const handleToggleBookmark = useCallback(() => {
    if (!documentId) {
      return;
    }
    isBookmarked
      ? deleteBookmark({ type: "document", id: documentId })
      : createBookmark({ type: "document", id: documentId });
  }, [isBookmarked, deleteBookmark, createBookmark, documentId]);

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
                    dispatch(push(`/document/${_document.id}`));
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
                  dispatch(replace(`/document/${_document.id}`));
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
        } else if (result.error) {
          throw result.error;
        }
      } catch (error) {
        console.error("Failed to save document:", error);
        sendToast({ message: t`Error saving document`, icon: "warning" });
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

  return (
    <>
      <Box
        className={cx(styles.documentPage, {
          [styles.commentsOpened]: commentSidebarOpen,
        })}
      >
        <SetTitle title={documentData?.name || t`New document`} />
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
                onSave={() => {
                  if (isNewDocument) {
                    setCollectionPickerMode("save");
                  } else {
                    handleSave();
                  }
                }}
                onMove={() => setCollectionPickerMode("move")}
                onToggleBookmark={handleToggleBookmark}
                onArchive={() => handleUpdate({ archived: true })}
                hasComments={hasComments}
              />
              <Editor
                onEditorReady={setEditorInstance}
                onCardEmbedsChange={updateCardEmbeds}
                onQuestionSelect={handleQuestionSelect}
                initialContent={documentContent}
                onChange={handleChange}
                editable={canWrite}
                isLoading={isDocumentLoading}
              />
            </Box>
          </Box>

          {selectedQuestionId &&
            selectedEmbedIndex !== null &&
            editorInstance && (
              <Box
                className={styles.sidebar}
                data-testid="document-card-sidebar"
              >
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
              value={{ id: "root", model: "collection" }}
              options={{
                showPersonalCollections: true,
                showRootCollection: true,
              }}
              onChange={async (collection) => {
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
          <LeaveRouteConfirmModal
            // `key` remounts this modal when navigating between different documents or to a new document.
            // The `route` doesn't change in that scenario which prevents the modal from closing when you confirm you want to discard your changes.
            key={location.key}
            isEnabled={hasUnsavedChanges() && !isNavigationScheduled}
            route={route}
          />

          <LeaveConfirmModal
            // only applies when going from /new -> /new
            opened={
              hasUnsavedChanges() &&
              isNewDocument &&
              location.key !== previousLocationKey
            }
            onConfirm={resetDocument}
            onClose={() => forceUpdate()}
          />
        </Box>
      </Box>
      {children}
    </>
  );
};
