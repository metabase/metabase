import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { JSONContent, Editor as TiptapEditor } from "@tiptap/react";
import dayjs from "dayjs";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { skipToken } from "metabase/api";
import {
  useCreateDocumentMutation,
  useGetDocumentQuery,
  useUpdateDocumentMutation,
} from "metabase/api/document";
import { useToast } from "metabase/common/hooks";
import {
  type ScheduleCallback,
  useCallbackEffect,
} from "metabase/common/hooks/use-callback-effect";
import { useDispatch, useSelector } from "metabase/redux";
import type { CardEmbedRef } from "metabase/redux/store/documents";
import * as Urls from "metabase/urls";
import type {
  Card,
  CollectionId,
  Document,
  DocumentId,
  RegularCollectionId,
} from "metabase-types/api";

import { trackDocumentCreated, trackDocumentUpdated } from "../analytics";
import {
  clearDraftCards,
  setCurrentDocument,
  setHasUnsavedChanges,
} from "../documents.slice";
import { getDraftCards, getHasUnsavedChanges } from "../selectors";

import { useDocumentState } from "./use-document-state";
import { useRegisterDocumentMetabotContext } from "./use-register-document-metabot-context";

interface UseDocumentEditorParams {
  documentId: DocumentId | "new" | undefined;
}

interface UseDocumentEditorResult {
  editorInstance: TiptapEditor | null;
  setEditorInstance: Dispatch<SetStateAction<TiptapEditor | null>>;
  collectionPickerMode: "save" | "move" | null;
  setCollectionPickerMode: Dispatch<SetStateAction<"save" | "move" | null>>;
  isNavigationScheduled: boolean;
  scheduleNavigation: ScheduleCallback;
  isNewDocument: boolean;
  isSaving: boolean;
  documentData: Document | undefined;
  isDocumentLoading: boolean;
  error: unknown;
  canWrite: boolean;
  documentTitle: string;
  setDocumentTitle: Dispatch<SetStateAction<string>>;
  documentContent: JSONContent | null;
  setDocumentContent: (content: JSONContent | null) => void;
  updateCardEmbeds: (embeds: CardEmbedRef[]) => void;
  hasUnsavedChanges: () => boolean;
  showSaveButton: boolean;
  handleChange: (content: JSONContent) => void;
  handleSave: (
    collectionId?: RegularCollectionId | null,
  ) => Promise<{ document?: Document; error?: unknown } | undefined>;
  handleUpdate: (payload: {
    collection_id?: CollectionId | null;
    archived?: boolean;
  }) => Promise<void>;
}

export function useDocumentEditor({
  documentId,
}: UseDocumentEditorParams): UseDocumentEditorResult {
  const dispatch = useDispatch();
  const [sendToast] = useToast();

  const draftCards = useSelector(getDraftCards);
  const hasUnsavedEditorChanges = useSelector(getHasUnsavedChanges);

  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(
    null,
  );
  const [collectionPickerMode, setCollectionPickerMode] = useState<
    "save" | "move" | null
  >(null);

  const [isNavigationScheduled, scheduleNavigation] = useCallbackEffect();

  const [createDocument, { isLoading: isCreating }] =
    useCreateDocumentMutation();
  const [updateDocument, { isLoading: isUpdating }] =
    useUpdateDocumentMutation();

  const isNewDocument = documentId === "new";
  const isSaving = isCreating || isUpdating;

  let {
    currentData: documentData,
    isLoading: isDocumentLoading,
    error,
  } = useGetDocumentQuery(
    documentId && !isNewDocument ? { id: documentId } : skipToken,
  );
  if (documentId !== documentData?.id) {
    documentData = undefined;
  }

  const canWrite = Boolean(
    !documentData?.archived && (isNewDocument || documentData?.can_write),
  );

  const {
    documentTitle,
    setDocumentTitle,
    documentContent,
    setDocumentContent,
    updateCardEmbeds,
  } = useDocumentState(documentData);

  useEffect(() => {
    // Set current document when document loads (includes collection_id and all other data)
    if (documentData && !isNewDocument) {
      dispatch(setCurrentDocument(documentData));
    } else if (isNewDocument) {
      dispatch(setCurrentDocument(null));
    }
  }, [documentData, documentId, dispatch, isNewDocument]);

  useRegisterDocumentMetabotContext();

  // Reset dirty state when document content loads from API
  useEffect(() => {
    if (documentContent && !isNewDocument) {
      dispatch(setHasUnsavedChanges(false));
    }
  }, [dispatch, documentContent, isNewDocument]);

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

  const handleUpdate = async (payload: {
    collection_id?: CollectionId | null;
    archived?: boolean;
  }) => {
    if (documentData?.id) {
      await updateDocument({ id: documentData.id, ...payload });
      setCollectionPickerMode(null);
    }
  };

  return {
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
    handleChange,
    handleSave,
    handleUpdate,
  };
}
