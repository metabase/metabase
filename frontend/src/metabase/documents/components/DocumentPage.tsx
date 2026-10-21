import { useForceUpdate } from "@mantine/hooks";
import { useEditorState } from "@tiptap/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import {
  useCopyDocumentMutation,
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useListBookmarksQuery,
} from "metabase/api";
import { canonicalCollectionId } from "metabase/common/collections/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { CopyModal } from "metabase/common/components/CopyModal";
import { LeaveConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { getUserPersonalCollectionId } from "metabase/current-user";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch, useSelector } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import { Outlet, useLocation, useNavigate, useParams } from "metabase/router";
import { Box, Transition, type TransitionProps } from "metabase/ui";
import { extractEntityId } from "metabase/urls";
import * as Urls from "metabase/urls";
import { getProductAnalyticsDocumentContext } from "metabase-types/guards";

import {
  trackDocumentBookmark,
  trackDocumentCreated,
  trackDocumentDuplicated,
  trackDocumentUnsavedChangesWarningDisplayed,
  trackDocumentUpdated,
} from "../analytics";
import {
  PrefetchQueueProvider,
  usePrefetchQueue,
} from "../contexts/PrefetchQueueContext";
import { PrintContext } from "../contexts/PrintContext";
import { ScrollContainerProvider } from "../contexts/ScrollContainerContext";
import {
  closeSidebar,
  openHistorySidebar,
  resetDocuments,
  setChildTargetId,
  setHasUnsavedChanges,
} from "../documents.slice";
import { useDocumentEditor } from "../hooks/use-document-editor";
import { usePrintContextValue } from "../hooks/use-print-context-value";
import { useSidePanelWidths } from "../hooks/use-side-panel-widths";
import { useSyncCommentsSidebar } from "../hooks/use-sync-comments-sidebar";
import {
  getSelectedEmbedIndex,
  getSelectedQuestionId,
  getSidebarMode,
} from "../selectors";

import { DocumentArchivedEntityBanner } from "./DocumentArchivedEntityBanner";
import { DocumentHeader } from "./DocumentHeader";
import styles from "./DocumentPage.module.css";
import { DocumentRevisionHistorySidebar } from "./DocumentRevisionHistorySidebar";
import { Editor } from "./Editor";
import { EmbedQuestionSettingsSidebar } from "./EmbedQuestionSettingsSidebar";
import { EmbedTimelineSidebar } from "./EmbedTimelineSidebar";
import { NotebookStartActions } from "./NotebookStartActions";
import { SidePanelResizeHandle } from "./SidePanelResizeHandle";
import {
  type UseDocumentPageAddon,
  useNoDocumentPageAddon,
} from "./document-page-addon";

// Fades and collapses, so the editor slides up as the start buttons go.
const START_ACTIONS_TRANSITION: TransitionProps["transition"] = {
  in: { opacity: 1, maxHeight: "20rem" },
  out: { opacity: 0, maxHeight: 0 },
  common: { overflow: "hidden" },
  transitionProperty: "opacity, max-height",
};

// The prefetch queue tracks every card embed's in-flight load, so it doubles
// as the print-readiness signal: printing waits until nothing is loading.
const DocumentPrintContextProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const prefetchQueue = usePrefetchQueue();
  const areDocumentCardsReadyForPrint = useCallback(
    () => !prefetchQueue?.hasInflightLoads(),
    [prefetchQueue],
  );
  const printContextValue = usePrintContextValue({
    isReady: areDocumentCardsReadyForPrint,
  });

  return (
    <PrintContext.Provider value={printContextValue}>
      {children}
    </PrintContext.Provider>
  );
};

type DocumentPageProps = {
  useAddon?: UseDocumentPageAddon;
};

export const DocumentPage = ({
  useAddon = useNoDocumentPageAddon,
}: DocumentPageProps) => {
  const location = useLocation();
  const { entityId, childTargetId: paramsChildTargetId } = useParams<{
    entityId: string;
    childTargetId: string;
  }>();
  const previousLocationKey = usePrevious(location.key);
  const forceUpdate = useForceUpdate();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const selectedQuestionId = useSelector(getSelectedQuestionId);
  const selectedEmbedIndex = useSelector(getSelectedEmbedIndex);
  const sidebarMode = useSelector(getSidebarMode);
  const vizSettingsPanel = useSidePanelWidths({
    storageKey: "metabase.documents.viz-settings-width",
    isPaletteOpen: false,
  });
  const [mainContentEl, setMainContentEl] = useState<HTMLDivElement | null>(
    null,
  );
  const [copyDocument] = useCopyDocumentMutation();
  const [duplicateModalMode, setDuplicateModalMode] = useState<
    "duplicate" | "leave" | null
  >(null);

  const documentId = entityId === "new" ? "new" : extractEntityId(entityId);
  // New notebooks are auto-saved to the creator's personal collection.
  const personalCollectionId = useSelector(getUserPersonalCollectionId);

  const {
    editorInstance,
    setEditorInstance,
    collectionPickerMode,
    setCollectionPickerMode,
    editorContainerRef,
    scheduleNavigation,
    isNewDocument,
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
    saveStatus,
    handleChange,
    handleSave,
    handleUpdate,
    handleQuestionSelect,
  } = useDocumentEditor({
    documentId,
    autoSave: { collectionId: personalCollectionId ?? null },
    onDocumentCreated: trackDocumentCreated,
    onDocumentUpdated: (document) =>
      trackDocumentUpdated(document, "standalone"),
  });

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

  const isEditorEmpty =
    useEditorState({
      editor: editorInstance,
      selector: ({ editor }) => editor?.isEmpty ?? false,
    }) ?? false;

  const addon = useAddon({
    editor: editorInstance,
    canWrite: canWrite ?? false,
    savedContent: documentData?.document,
  });

  // Analysis documents have their own page, with table and date-range pickers.
  const isAnalysisDocument =
    getProductAnalyticsDocumentContext(documentData?.document) !== undefined;
  useEffect(() => {
    if (documentData && isAnalysisDocument) {
      navigate(Urls.analysisDocument(documentData), { replace: true });
    }
  }, [documentData, isAnalysisDocument, navigate]);

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

  // As with analysis cards, a click on the page canvas outside any question
  // card closes a card's visualization settings.
  useEffect(() => {
    if (sidebarMode !== "viz-settings" || mainContentEl === null) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const { target } = event;
      const isOnCanvas =
        target instanceof Element && mainContentEl.contains(target);
      const isOnQuestionCard =
        target instanceof Element &&
        target.closest('[data-type="cardEmbed"]') !== null;
      if (isOnCanvas && !isOnQuestionCard) {
        dispatch(closeSidebar());
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [sidebarMode, mainContentEl, dispatch]);

  const handleCloseComments = useCallback(() => {
    navigate(".", { relative: "route" }); // remove the "/comments" path
  }, [navigate]);

  useSyncCommentsSidebar({
    areCommentsOpen: paramsChildTargetId != null,
    onCloseComments: handleCloseComments,
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
    dispatch(openHistorySidebar());
  }, [dispatch]);

  const focusEditorBody = useCallback(() => {
    editorInstance?.commands.focus("start");
  }, [editorInstance]);

  usePageTitle(documentData?.name || t`New document`, { titleIndex: 1 });

  // A "New document" click from `/document/new` targets the URL we are already
  // on, so nothing unmounts. v7 mints a fresh `location.key` for it (the click
  // resolves as a replace), and that key is what marks the re-entry.
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

  if (isAnalysisDocument) {
    return null;
  }

  return addon.wrap(
    <PrefetchQueueProvider>
      <DocumentPrintContextProvider>
        <Box className={styles.documentPage}>
          {documentData?.archived && <DocumentArchivedEntityBanner />}
          <Box className={styles.contentArea}>
            <Box className={styles.mainContent} ref={setMainContentEl}>
              <ScrollContainerProvider value={mainContentEl}>
                <Box className={styles.documentContainer}>
                  <DocumentHeader
                    document={documentData}
                    documentTitle={documentTitle}
                    isNewDocument={isNewDocument}
                    canWrite={canWrite ?? false}
                    saveStatus={saveStatus}
                    isBookmarked={isBookmarked}
                    onTitleChange={setDocumentTitle}
                    onTitleSubmit={focusEditorBody}
                    onMove={() => setCollectionPickerMode("move")}
                    onDuplicate={handleDuplicate}
                    onToggleBookmark={handleToggleBookmark}
                    onArchive={() => handleUpdate({ archived: true })}
                    onShowHistory={handleShowHistory}
                  />
                  {editorInstance !== null && (
                    <Transition
                      mounted={isEditorEmpty && canWrite && !isDocumentLoading}
                      transition={START_ACTIONS_TRANSITION}
                      duration={250}
                      timingFunction="ease"
                    >
                      {(style) => (
                        <NotebookStartActions
                          editor={editorInstance}
                          style={style}
                          extraActions={addon.startActions}
                        />
                      )}
                    </Transition>
                  )}
                  <Editor
                    extraExtensions={addon.extraExtensions}
                    hostOverride={addon.hostOverride}
                    onEditorReady={setEditorInstance}
                    onCardEmbedsChange={updateCardEmbeds}
                    onQuestionSelect={handleQuestionSelect}
                    initialContent={documentContent}
                    onChange={handleChange}
                    editable={canWrite}
                    isLoading={isDocumentLoading}
                    editorContainerRef={editorContainerRef}
                  />
                </Box>
              </ScrollContainerProvider>
            </Box>

            {addon.sidePanel}

            {sidebarMode === "viz-settings" &&
              selectedQuestionId &&
              selectedEmbedIndex !== null &&
              editorInstance && (
                <Box
                  className={styles.floatingSidebar}
                  data-testid="document-card-sidebar"
                >
                  <Box className={styles.resizableSidebar}>
                    <SidePanelResizeHandle
                      handle="outer"
                      isActive={vizSettingsPanel.activeHandle === "outer"}
                      onPointerDown={(event) =>
                        vizSettingsPanel.startResize("outer", event)
                      }
                    />
                    <Box
                      className={styles.floatingSidebarCard}
                      w={vizSettingsPanel.widths.settings}
                    >
                      <EmbedQuestionSettingsSidebar
                        cardId={selectedQuestionId}
                        editorInstance={editorInstance}
                      />
                    </Box>
                  </Box>
                </Box>
              )}

            {sidebarMode === "timeline-events" &&
              selectedQuestionId &&
              selectedEmbedIndex !== null &&
              editorInstance && (
                <Box
                  className={styles.sidebar}
                  data-testid="document-timeline-sidebar"
                >
                  <EmbedTimelineSidebar
                    cardId={selectedQuestionId}
                    selectedEmbedIndex={selectedEmbedIndex}
                    editorInstance={editorInstance}
                    collectionId={documentData?.collection_id ?? null}
                  />
                </Box>
              )}

            {collectionPickerMode && (
              <CollectionPickerModal
                title={t`Where should we save this document?`}
                onClose={() => setCollectionPickerMode(null)}
                entityType="document"
                value={{
                  id: documentData?.collection_id ?? "root",
                  model: "collection",
                }}
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
              <CopyModal
                entityType="documents"
                onClose={() => setDuplicateModalMode(null)}
                onSaved={(document) => {
                  setDuplicateModalMode(null);
                  scheduleNavigation(() => {
                    navigate(Urls.document(document));
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
                      response.error ??
                      new Error("Failed to duplicate document")
                    );
                  }

                  const _document = response.data;
                  trackDocumentDuplicated(_document);
                  return _document;
                }}
              />
            )}

            {sidebarMode === "comments" && <Outlet />}

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
          {sidebarMode === "history" && documentData && (
            <Box
              className={styles.sidebar}
              data-testid="document-history-sidebar"
            >
              <DocumentRevisionHistorySidebar
                document={documentData}
                onClose={() => dispatch(closeSidebar())}
              />
            </Box>
          )}
        </Box>
      </DocumentPrintContextProvider>
    </PrefetchQueueProvider>,
  );
};
