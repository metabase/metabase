import { useEditorState } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useLazyGetTableQuery } from "metabase/api";
import { canonicalCollectionId } from "metabase/common/collections/utils";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useToast } from "metabase/common/hooks";
import { Editor } from "metabase/documents/components/Editor";
import { ScrollContainerProvider } from "metabase/documents/contexts/ScrollContainerContext";
import { useDocumentEditor } from "metabase/documents/hooks/use-document-editor";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import { useLocation, useParams } from "metabase/router";
import { Alert, Box, Icon, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  ConcreteTableId,
  DocumentId,
  ProductAnalyticsDocumentContext,
} from "metabase-types/api";
import { getProductAnalyticsDocumentContext } from "metabase-types/guards";

import { DEFAULT_DATE_RANGE } from "../date-range";
import { AnalysisDocumentProvider } from "../document/AnalysisDocumentContext";
import { AnalysisDocumentHeader } from "../document/AnalysisDocumentHeader";
import { AnalysisGallery } from "../document/AnalysisGallery";
import { AnalysisSidePanel } from "../document/AnalysisSidePanel";
import { InsertAnalysisButton } from "../document/InsertAnalysisButton";
import { findAnalysisNode } from "../document/analysis-node-utils";
import {
  readDocumentContext,
  writeDocumentContext,
} from "../document/document-context";
import {
  ANALYSIS_DOCUMENT_EXTENSIONS,
  analysisDocumentEditorHost,
} from "../document/editor-host";
import { useAnalysisDocumentState } from "../document/use-analysis-document-state";
import { usePrototypeTable } from "../use-prototype-table";

const DOCUMENT_MAX_WIDTH = 900;

const parseDocumentId = (
  value: string | undefined,
): DocumentId | "new" | undefined => {
  if (value === undefined) {
    return "new";
  }
  return /^\d+$/.test(value) ? Number(value) : undefined;
};

export const AnalysisDocumentPage = () => {
  const { id } = useParams<{ id: string }>();
  const documentId = parseDocumentId(id);

  if (documentId === undefined) {
    return <NotFound />;
  }
  return <AnalysisDocumentEditor key={documentId} documentId={documentId} />;
};

type AnalysisDocumentEditorProps = {
  documentId: DocumentId | "new";
};

const AnalysisDocumentEditor = ({
  documentId,
}: AnalysisDocumentEditorProps) => {
  const dispatch = useDispatch();
  const location = useLocation();
  const [sendToast] = useToast();
  const prototype = usePrototypeTable();
  const [fetchTable] = useLazyGetTableQuery();
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(
    null,
  );
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  const {
    editorInstance: editor,
    setEditorInstance,
    collectionPickerMode,
    setCollectionPickerMode,
    editorContainerRef,
    isNavigationScheduled,
    isNewDocument,
    isSaving,
    documentData,
    isDocumentLoading,
    error,
    canWrite,
    documentTitle,
    setDocumentTitle,
    documentContent,
    updateCardEmbeds,
    hasUnsavedChanges,
    showSaveButton,
    handleChange,
    handleSave,
    handleQuestionSelect,
  } = useDocumentEditor({
    documentId,
    getDocumentUrl: Urls.analysisDocument,
  });

  useEffect(() => {
    if (error) {
      dispatch(setErrorPage(error));
    }
  }, [dispatch, error]);

  usePageTitle(documentData?.name || t`New analysis`, { titleIndex: 1 });

  const editorContext = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor !== null ? readDocumentContext(editor.state.doc) : undefined,
  });
  const isEmpty =
    useEditorState({
      editor,
      selector: ({ editor }) => editor?.isEmpty ?? true,
    }) ?? true;
  const savedContent = documentData?.document;
  const documentContext = useMemo(
    (): ProductAnalyticsDocumentContext =>
      editorContext ??
      getProductAnalyticsDocumentContext(savedContent) ?? {
        version: 1,
        table_id: prototype.tableId ?? null,
        date_range: DEFAULT_DATE_RANGE,
      },
    [editorContext, savedContent, prototype.tableId],
  );
  const tableId = documentContext.table_id ?? undefined;

  const state = useAnalysisDocumentState({
    editor,
    tableId,
    dateRange: documentContext.date_range,
    canWrite,
  });

  // The context marks this as an analysis document, so the standard document
  // page redirects here instead of dropping the analyses. Written once there's
  // content, after the editor has loaded what was saved.
  const hasStoredContext = editorContext != null;
  useEffect(() => {
    if (editor !== null && canWrite && !isEmpty && !hasStoredContext) {
      writeDocumentContext(editor, documentContext, { addToHistory: false });
    }
  }, [editor, canWrite, isEmpty, hasStoredContext, documentContext]);

  const updateDocumentContext = (
    changes: Partial<ProductAnalyticsDocumentContext>,
  ) => {
    if (editor !== null && canWrite) {
      writeDocumentContext(editor, { ...documentContext, ...changes });
    }
  };

  // Prototype: the generated SQL is ClickHouse-only. Lift this once SQL
  // generation moves to MBQL.
  const handleTableChange = async (id: ConcreteTableId) => {
    const { data: table } = await fetchTable({ id }, true);
    if (table && prototype.clickHouseDatabaseIds.includes(table.db_id)) {
      updateDocumentContext({ table_id: id });
    } else {
      sendToast({
        icon: "warning",
        message: t`For now, only tables in ClickHouse databases can be analyzed.`,
      });
    }
  };

  const handleSaveClick = () => {
    if (isNewDocument) {
      setCollectionPickerMode("save");
    } else {
      handleSave();
    }
  };

  const editingDefinition = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor !== null && state.editingNodeId !== null
        ? findAnalysisNode(editor.state.doc, state.editingNodeId)?.definition
        : undefined,
  });
  const sidePanel =
    state.editingNodeId !== null &&
    state.panelTab !== null &&
    editingDefinition != null
      ? {
          nodeId: state.editingNodeId,
          definition: editingDefinition,
          panelTab: state.panelTab,
        }
      : null;

  return (
    <AnalysisDocumentProvider value={state}>
      <Box display="flex" h="100%" bg="background-primary">
        <Box
          flex={1}
          miw={0}
          style={{ overflowY: "auto" }}
          ref={setScrollContainer}
        >
          <ScrollContainerProvider value={scrollContainer}>
            <Stack
              maw={DOCUMENT_MAX_WIDTH}
              mx="auto"
              px="xl"
              pt="xl"
              pb="4rem"
              gap="xl"
            >
              <AnalysisDocumentHeader
                title={documentTitle}
                tableId={tableId}
                dateRange={documentContext.date_range}
                isTableLoading={prototype.isLoading}
                canWrite={canWrite}
                showSaveButton={showSaveButton}
                onTitleChange={setDocumentTitle}
                onTableChange={handleTableChange}
                onDateRangeChange={(dateRange) =>
                  updateDocumentContext({ date_range: dateRange })
                }
                onSave={handleSaveClick}
              />
              {prototype.error && (
                <Alert color="error" icon={<Icon name="warning" />}>
                  {prototype.error}
                </Alert>
              )}
              {isEmpty && canWrite && !isDocumentLoading && (
                <AnalysisGallery
                  isDisabled={tableId === undefined}
                  onSelect={state.insertAnalysis}
                />
              )}
              <Box pos="relative" ref={editorWrapperRef}>
                <Editor
                  placeholder={t`Or start writing. Type "/" to add an analysis, a chart, or a heading.`}
                  extraExtensions={ANALYSIS_DOCUMENT_EXTENSIONS}
                  hostOverride={analysisDocumentEditorHost}
                  onEditorReady={setEditorInstance}
                  onCardEmbedsChange={updateCardEmbeds}
                  onQuestionSelect={handleQuestionSelect}
                  initialContent={documentContent}
                  onChange={handleChange}
                  editable={canWrite && !isSaving}
                  isLoading={isDocumentLoading}
                  editorContainerRef={editorContainerRef}
                />
                {editor !== null && canWrite && (
                  <InsertAnalysisButton
                    editor={editor}
                    containerRef={editorWrapperRef}
                    isDisabled={tableId === undefined}
                    onSelect={state.insertAnalysis}
                  />
                )}
              </Box>
            </Stack>
          </ScrollContainerProvider>
        </Box>
        {sidePanel !== null && (
          <Box
            h="100%"
            style={{
              flexShrink: 0,
              borderLeft: "1px solid var(--mb-color-border)",
            }}
          >
            <AnalysisSidePanel key={sidePanel.nodeId} {...sidePanel} />
          </Box>
        )}
      </Box>
      {collectionPickerMode === "save" && (
        <CollectionPickerModal
          title={t`Where should we save this analysis?`}
          entityType="document"
          value={{
            id: documentData?.collection_id ?? "root",
            model: "collection",
          }}
          onClose={() => setCollectionPickerMode(null)}
          onChange={(collection) => {
            handleSave(canonicalCollectionId(collection.id));
            setCollectionPickerMode(null);
          }}
        />
      )}
      <LeaveRouteConfirmModal
        key={location.key}
        isEnabled={hasUnsavedChanges() && !isNavigationScheduled}
      />
    </AnalysisDocumentProvider>
  );
};
