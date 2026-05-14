import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { JSONContent, Editor as TiptapEditor } from "@tiptap/react";
import dayjs from "dayjs";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { replace } from "react-router-redux";
import useBeforeUnload from "react-use/lib/useBeforeUnload";
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
  updateSelectedEmbedIndex,
} from "../documents.slice";
import {
  getDraftCards,
  getHasUnsavedChanges,
  getSelectedEmbedIndex,
} from "../selectors";

import { useDocumentState } from "./use-document-state";
import { useRegisterDocumentMetabotContext } from "./use-register-document-metabot-context";
import { useScrollToAnchor } from "./use-scroll-to-anchor";

interface UseDocumentEditorParams {
  documentId: DocumentId | "new" | undefined;
}

interface UseDocumentEditorResult {
  editorInstance: TiptapEditor | null;
  setEditorInstance: Dispatch<SetStateAction<TiptapEditor | null>>;
  collectionPickerMode: "save" | "move" | null;
  setCollectionPickerMode: Dispatch<SetStateAction<"save" | "move" | null>>;
  editorContainerRef: React.RefObject<HTMLDivElement>;
  isNavigationScheduled: boolean;
  scheduleNavigation: ScheduleCallback;
  isNewDocument: boolean;
  isSaving: boolean;
  documentData: Document | undefined;
  isDocumentLoading: boolean;
  error: unknown;
  canWrite: boolean;
  documentTitle: string;
  setDocumentTitle: (title: string) => void;
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
  handleQuestionSelect: (
    cardId: number | null,
    embedIndex?: number | null,
  ) => void;
}

export function useDocumentEditor({
  documentId,
}: UseDocumentEditorParams): UseDocumentEditorResult {
  const dispatch = useDispatch();
  const [sendToast] = useToast();

  const draftCards = useSelector(getDraftCards);
  const hasUnsavedEditorChanges = useSelector(getHasUnsavedChanges);
  const selectedEmbedIndex = useSelector(getSelectedEmbedIndex);

  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(
    null,
  );
  const [collectionPickerMode, setCollectionPickerMode] = useState<
    "save" | "move" | null
  >(null);

  const editorContainerRef = useRef<HTMLDivElement>(null);

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

  useBeforeUnload(() => {
    // warn if you try to navigate away with unsaved changes
    return hasUnsavedChanges();
  });

  // Track the "settled" editor content as the baseline for dirty checking.
  // When TipTap processes loaded content it applies default attributes (height,
  // minHeight, _id) and schema corrections (trailing paragraph). We capture the
  // editor's output after it settles and compare against that, not the raw API JSON.
  const settledContentRef = useRef<JSONContent | null>(null);

  // while the title doesn't have the same problem as content,
  // when loading a new document, there is a render where the server state and local state are out of sync
  const isTitleSettlingRef = useRef(false);

  const prevDocumentIdRef = useRef<DocumentId | "new" | undefined>(undefined);
  if (
    documentId &&
    documentId !== prevDocumentIdRef.current &&
    !isNewDocument
  ) {
    prevDocumentIdRef.current = documentId;
    settledContentRef.current = null;
    isTitleSettlingRef.current = true;
  }

  useEffect(() => {
    if (documentContent && !isNewDocument) {
      settledContentRef.current = null;
      setTimeout(() => {
        const content = editorInstance?.getJSON();
        if (content) {
          settledContentRef.current = content;
        }
      }, 0);
      dispatch(setHasUnsavedChanges(false));
    }
  }, [dispatch, documentContent, isNewDocument, editorInstance]);

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
    const titleChanged =
      documentTitle !== originalTitle && !isTitleSettlingRef.current;

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

  const handleTitleChange = useCallback(
    (title: string) => {
      setDocumentTitle(title);
      isTitleSettlingRef.current = false;
    },
    [setDocumentTitle],
  );

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

      const baseline = settledContentRef.current;
      if (baseline) {
        dispatch(setHasUnsavedChanges(!_.isEqual(content, baseline)));
      }
    },
    [dispatch, editorInstance, isNewDocument],
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

  const handleUpdate = async (payload: {
    collection_id?: CollectionId | null;
    archived?: boolean;
  }) => {
    if (documentData?.id) {
      await updateDocument({ id: documentData.id, ...payload });
      setCollectionPickerMode(null);
    }
  };

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
        dispatch(updateSelectedEmbedIndex(embedIndex));
      }
    },
    [dispatch, selectedEmbedIndex],
  );

  return {
    editorInstance,
    setEditorInstance,
    collectionPickerMode,
    setCollectionPickerMode,
    editorContainerRef,
    isNavigationScheduled,
    scheduleNavigation,
    isNewDocument,
    isSaving,
    documentData,
    isDocumentLoading,
    error,
    canWrite,
    documentTitle,
    setDocumentTitle: handleTitleChange,
    documentContent,
    setDocumentContent,
    updateCardEmbeds,
    hasUnsavedChanges,
    showSaveButton,
    handleChange,
    handleSave,
    handleUpdate,
    handleQuestionSelect,
  };
}
