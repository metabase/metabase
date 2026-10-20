import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { JSONContent, Editor as TiptapEditor } from "@tiptap/react";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import useBeforeUnload from "react-use/lib/useBeforeUnload";
import { t } from "ttag";
import _ from "underscore";

import { skipToken } from "metabase/api";
import {
  useCreateDocumentMutation,
  useGetDocumentQuery,
  useUpdateDocumentMutation,
} from "metabase/api/document";
import { getFormattedTime } from "metabase/common/components/DateTime";
import { useToast } from "metabase/common/hooks";
import {
  type ScheduleCallback,
  useCallbackEffect,
} from "metabase/common/hooks/use-callback-effect";
import { useDispatch, useSelector } from "metabase/redux";
import type { CardEmbedRef } from "metabase/redux/store/documents";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  CardId,
  CollectionId,
  Document,
  DocumentCardToCreate,
  DocumentId,
  RegularCollectionId,
} from "metabase-types/api";

import {
  clearDraftCards,
  resetDocuments,
  setCurrentDocument,
  setHasUnsavedChanges,
  setSidebarEmbedIndex,
} from "../documents.slice";
import {
  getDraftCardOriginalIds,
  getDraftCards,
  getHasUnsavedChanges,
} from "../selectors";

import { useDocumentState } from "./use-document-state";
import { useRegisterDocumentMetabotContext } from "./use-register-document-metabot-context";
import { useScrollToAnchor } from "./use-scroll-to-anchor";

interface UseDocumentEditorParams {
  documentId: DocumentId | "new" | undefined;
  onDocumentCreated?: (document: Document) => void;
  onDocumentUpdated?: (document: Document) => void;
  /** Where to go once a new document is created. Defaults to the document page. */
  getDocumentUrl?: (document: Document) => string;
  /**
   * Saves changes shortly after they're made, creating a new document in
   * `collectionId` on the first change. Off by default.
   */
  autoSave?: { collectionId: RegularCollectionId | null };
}

export type SaveStatus = "saving" | "saved" | null;

const AUTO_SAVE_DELAY_MS = 800;

/** Marks the navigation from `/new` to a document that was just auto-created. */
export const CREATED_FROM_NEW_STATE = { isCreatedFromNew: true };

interface UseDocumentEditorResult {
  editorInstance: TiptapEditor | null;
  setEditorInstance: Dispatch<SetStateAction<TiptapEditor | null>>;
  collectionPickerMode: "save" | "move" | null;
  setCollectionPickerMode: Dispatch<SetStateAction<"save" | "move" | null>>;
  editorContainerRef: RefObject<HTMLDivElement>;
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
  saveStatus: SaveStatus;
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
  onDocumentCreated,
  onDocumentUpdated,
  getDocumentUrl = Urls.document,
  autoSave,
}: UseDocumentEditorParams): UseDocumentEditorResult {
  const isAutoSaveEnabled = autoSave !== undefined;
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [sendToast] = useToast();

  const draftCards = useSelector(getDraftCards);
  const draftCardOriginalIds = useSelector(getDraftCardOriginalIds);
  const hasUnsavedEditorChanges = useSelector(getHasUnsavedChanges);

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
  const [updateDocument, { isLoading: isUpdating }] = useUpdateDocumentMutation(
    {
      fixedCacheKey: documentId ? `document:${documentId}` : undefined,
    },
  );

  const isNewDocument = documentId === "new";
  const isSaving = isCreating || isUpdating;

  // Auto-save creates a new document on the first change and moves to its URL
  // without remounting, so the editor keeps its content, cursor, and history.
  const justCreatedIdRef = useRef<DocumentId | null>(null);
  const isJustCreated =
    documentId !== undefined && documentId === justCreatedIdRef.current;
  // What auto-save last sent, so reloads of our own save don't reset the editor.
  const lastSavedRef = useRef<{ name: string; document: JSONContent } | null>(
    null,
  );
  const savedTitleRef = useRef<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);

  const hasLoadedDocumentRef = useRef(false);

  // if the document is updating on mount (due to a previous update with the same fixedCacheKey),
  // then skip getDocument so we don't show the stale document
  // this is a little unusual - the standard pattern here would to be use an optimistic update on save
  // but a document with draft card IDs can't be rendered if Redux state has been cleared, so we need a different approach
  const isUpdatingOnMount = isUpdating && !hasLoadedDocumentRef.current;

  let {
    data: documentData,
    isLoading,
    error,
  } = useGetDocumentQuery(
    documentId && !isNewDocument && !isUpdatingOnMount
      ? { id: documentId }
      : skipToken,
  );
  if (documentId !== documentData?.id) {
    documentData = undefined;
  }
  if (documentData) {
    hasLoadedDocumentRef.current = true;
  }
  const isDocumentLoading = !isJustCreated && (isLoading || isUpdatingOnMount);
  const savedDocumentId = documentData?.id ?? justCreatedIdRef.current;
  if (isAutoSaveEnabled && documentData && savedTitleRef.current === null) {
    savedTitleRef.current = documentData.name;
  }

  const canWrite = Boolean(
    !documentData?.archived &&
    (isNewDocument || isJustCreated || documentData?.can_write),
  );

  const {
    documentTitle,
    setDocumentTitle,
    documentContent,
    setDocumentContent,
    documentNeedsMigration,
    updateCardEmbeds,
  } = useDocumentState(
    documentData,
    isAutoSaveEnabled ? lastSavedRef : undefined,
  );

  useEffect(() => {
    // Set current document when document loads (includes collection_id and all other data)
    if (documentData && !isNewDocument) {
      dispatch(setCurrentDocument(documentData));
    } else if (isNewDocument) {
      dispatch(setCurrentDocument(null));
    }
  }, [documentData, documentId, dispatch, isNewDocument]);

  // Clear documents redux state on unmount (breadcrumbs, sidebar, drafts, etc.)
  useEffect(() => {
    return () => {
      dispatch(resetDocuments());
    };
  }, [dispatch]);

  useRegisterDocumentMetabotContext();

  useBeforeUnload(() => {
    // warn if you try to navigate away with unsaved changes
    return hasUnsavedChanges();
  });

  // Track the "settled" editor content as the baseline for dirty checking.
  // When TipTap processes loaded content it applies default attributes (height,
  // minHeight) and schema corrections (trailing paragraph). We capture the
  // editor's output after it settles and compare against that, not the raw API JSON.
  // Missing `_id`s are not absorbed: they must be persisted so comments can
  // target nodes, so `documentNeedsMigration` forces dirty even after settling.
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
    if (!isJustCreated) {
      settledContentRef.current = null;
      isTitleSettlingRef.current = true;
    }
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
      if (documentNeedsMigration) {
        dispatch(setHasUnsavedChanges(true));
      } else {
        dispatch(setHasUnsavedChanges(false));
      }
    }
  }, [
    dispatch,
    documentContent,
    isNewDocument,
    editorInstance,
    documentNeedsMigration,
  ]);

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
    // when comparing saved with current titles, we need to use unmodified values
    const savedTitle = isAutoSaveEnabled
      ? (savedTitleRef.current ?? originalTitle)
      : originalTitle;
    const titleChanged =
      documentTitle !== savedTitle && !isTitleSettlingRef.current;

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
    isAutoSaveEnabled,
  ]);

  const latestTitleRef = useRef(documentTitle);
  latestTitleRef.current = documentTitle;

  const showSaveButton =
    !isAutoSaveEnabled && hasUnsavedChanges() && canWrite && !isSaving;

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveRef = useRef<() => void>(() => undefined);
  const scheduleAutoSave = useCallback(() => {
    if (!isAutoSaveEnabled) {
      return;
    }
    if (autoSaveTimerRef.current !== null) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      autoSaveRef.current();
    }, AUTO_SAVE_DELAY_MS);
  }, [isAutoSaveEnabled]);

  // Leaving with a save still pending saves right away instead of asking.
  useEffect(
    () => () => {
      if (autoSaveTimerRef.current !== null) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
        autoSaveRef.current();
      }
    },
    [],
  );

  const handleTitleChange = useCallback(
    (title: string) => {
      setDocumentTitle(title);
      isTitleSettlingRef.current = false;
      scheduleAutoSave();
    },
    [setDocumentTitle, scheduleAutoSave],
  );

  const handleChange = useCallback(
    (content: JSONContent) => {
      scheduleAutoSave();

      // For new documents, any content means changes
      if (isNewDocument) {
        // when navigating to `/new`, handleChange is fired but the editor instance hasn't been set yet
        dispatch(
          setHasUnsavedChanges(!!editorInstance && !editorInstance.isEmpty),
        );
        return;
      }

      if (documentNeedsMigration) {
        dispatch(setHasUnsavedChanges(true));
        return;
      }

      const baseline = settledContentRef.current;
      if (baseline) {
        dispatch(setHasUnsavedChanges(!_.isEqual(content, baseline)));
      }
    },
    [
      dispatch,
      editorInstance,
      isNewDocument,
      documentNeedsMigration,
      scheduleAutoSave,
    ],
  );

  const handleSave = useCallback(
    async (collectionId: RegularCollectionId | null = null) => {
      if (!editorInstance || isSaving) {
        return;
      }

      try {
        const cardsToSave: Record<number, DocumentCardToCreate> = {};
        const processedCardIds = new Set<number>();

        editorInstance.state.doc.descendants((node: ProseMirrorNode) => {
          if (node.type.name === "cardEmbed") {
            const cardId = node.attrs.id;
            if (!processedCardIds.has(cardId)) {
              processedCardIds.add(cardId);

              if (cardId < 0 && draftCards[cardId]) {
                const originalId: CardId | undefined =
                  draftCardOriginalIds[cardId];
                cardsToSave[cardId] =
                  originalId != null
                    ? { ...draftCards[cardId], source_card_id: originalId }
                    : draftCards[cardId];
              }
            }
          }
        });

        const documentAst = editorInstance.getJSON();
        const name =
          documentTitle.trim() ||
          (isAutoSaveEnabled
            ? t`Untitled notebook`
            : t`Untitled document - ${getFormattedTime(new Date(), "day", { local: true })}`);

        const newDocumentData = {
          name,
          document: documentAst,
          cards: Object.keys(cardsToSave).length > 0 ? cardsToSave : undefined,
        };

        const result = await (savedDocumentId !== null
          ? updateDocument({ ...newDocumentData, id: savedDocumentId }).then(
              (response) => {
                if (response.data) {
                  onDocumentUpdated?.(response.data);
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
                onDocumentCreated?.(_document);
                if (isAutoSaveEnabled) {
                  justCreatedIdRef.current = _document.id;
                }
                scheduleNavigation(() => {
                  navigate(
                    getDocumentUrl(_document),
                    isAutoSaveEnabled
                      ? { replace: true, state: CREATED_FROM_NEW_STATE }
                      : undefined,
                  );
                });
              }
              return response;
            }));

        if (result.data && isAutoSaveEnabled) {
          lastSavedRef.current = { name, document: documentAst };
          savedTitleRef.current = documentTitle;
          settledContentRef.current = documentAst;
          setHasSaved(true);
          dispatch(clearDraftCards());
          // Edits made while the save was in flight still need saving.
          const isStillDirty = !_.isEqual(
            editorInstance.getJSON(),
            documentAst,
          );
          dispatch(setHasUnsavedChanges(isStillDirty));
          if (isStillDirty || latestTitleRef.current !== documentTitle) {
            scheduleAutoSave();
          }
          return { document: result.data };
        } else if (result.data) {
          sendToast({
            message: documentData?.id ? t`Document saved` : t`Document created`,
          });
          dispatch(clearDraftCards());
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
      draftCardOriginalIds,
      documentData?.id,
      savedDocumentId,
      isAutoSaveEnabled,
      scheduleAutoSave,
      onDocumentCreated,
      onDocumentUpdated,
      getDocumentUrl,
      updateDocument,
      createDocument,
      scheduleNavigation,
      dispatch,
      navigate,
      sendToast,
    ],
  );

  autoSaveRef.current = () => {
    if (canWrite && hasUnsavedChanges()) {
      handleSave(autoSave?.collectionId ?? null);
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

        if (isAutoSaveEnabled) {
          autoSaveRef.current();
        } else if (isNewDocument) {
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
    isAutoSaveEnabled,
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
      if (cardId !== null && embedIndex != null && embedIndex >= 0) {
        dispatch(setSidebarEmbedIndex(embedIndex));
      }
    },
    [dispatch],
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
    saveStatus: getSaveStatus({ isAutoSaveEnabled, isSaving, hasSaved }),
    handleChange,
    handleSave,
    handleUpdate,
    handleQuestionSelect,
  };
}

const getSaveStatus = ({
  isAutoSaveEnabled,
  isSaving,
  hasSaved,
}: {
  isAutoSaveEnabled: boolean;
  isSaving: boolean;
  hasSaved: boolean;
}): SaveStatus => {
  if (!isAutoSaveEnabled) {
    return null;
  }
  if (isSaving) {
    return "saving";
  }
  return hasSaved ? "saved" : null;
};
