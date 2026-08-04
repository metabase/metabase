import { useCallback } from "react";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { trackDocumentUpdated } from "metabase/documents/analytics";
import { DocumentRevisionHistorySidebar } from "metabase/documents/components/DocumentRevisionHistorySidebar";
import { Editor } from "metabase/documents/components/Editor";
import { EmbedQuestionSettingsSidebar } from "metabase/documents/components/EmbedQuestionSettingsSidebar";
import { DOCUMENT_TITLE_MAX_LENGTH } from "metabase/documents/constants";
import { setIsHistorySidebarOpen } from "metabase/documents/documents.slice";
import { useDocumentEditor } from "metabase/documents/hooks/use-document-editor";
import {
  getIsHistorySidebarOpen,
  getSelectedEmbedIndex,
  getSelectedQuestionId,
} from "metabase/documents/selectors";
import { useDispatch, useSelector } from "metabase/redux";
import type { EditorCapabilities } from "metabase/rich_text_editing/tiptap/EditorHost";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Group,
  Icon,
  Stack,
  Tooltip,
} from "metabase/ui";
import type { ExplorationDocument } from "metabase-types/api";

import S from "./ExplorationSummary.module.css";
import { ExplorationSummarySkeleton } from "./ExplorationSummarySkeleton";

const SUMMARY_CAPABILITIES: EditorCapabilities = {
  canEmbedCharts: false,
  canUseMetabot: false,
  canOpenCardInQueryBuilder: false,
};

interface ExplorationSummaryProps {
  document: ExplorationDocument;
}

export function ExplorationSummary({ document }: ExplorationSummaryProps) {
  const dispatch = useDispatch();

  const {
    editorInstance,
    setEditorInstance,
    editorContainerRef,
    isDocumentLoading,
    error,
    canWrite,
    isSaving,
    documentTitle,
    setDocumentTitle,
    documentData,
    documentContent,
    updateCardEmbeds,
    handleChange,
    showSaveButton,
    handleSave,
    handleQuestionSelect,
  } = useDocumentEditor({
    documentId: document.id,
    onDocumentUpdated: (document) =>
      trackDocumentUpdated(document, "exploration"),
  });

  const selectedQuestionId = useSelector(getSelectedQuestionId);
  const selectedEmbedIndex = useSelector(getSelectedEmbedIndex);
  const isHistorySidebarOpen = useSelector(getIsHistorySidebarOpen);

  const handleShowHistory = useCallback(() => {
    dispatch(setIsHistorySidebarOpen(true));
  }, [dispatch]);

  if (error) {
    return (
      <Center w="100%" mih="20rem">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  if (isDocumentLoading) {
    return <ExplorationSummarySkeleton />;
  }

  return (
    <>
      <Stack
        flex={1}
        h="100%"
        pb="3rem"
        pr="1rem"
        align="center"
        style={{
          overflowY: "auto",
        }}
      >
        <Stack
          flex={1}
          w="100%"
          bg="background-primary"
          bd="1px solid border"
          bdrs="md"
          p="lg"
          pt="3rem"
          gap={0}
        >
          <Group h="2.5rem" w="100%" maw="42.5rem" mx="auto">
            <EditableText
              initialValue={documentTitle}
              onContentChange={setDocumentTitle}
              placeholder={t`Summary`}
              fw="bold"
              fz="h3"
              lh="h3"
              isDisabled={!canWrite || isSaving}
              p={0}
              flex={1}
              maxLength={DOCUMENT_TITLE_MAX_LENGTH}
            />
            {showSaveButton && (
              <Button
                variant="filled"
                onClick={() => handleSave()}
                data-hide-on-print
              >{t`Save`}</Button>
            )}
            {documentData && (
              <Tooltip label={t`Revision history`}>
                <Box>
                  <ActionIcon
                    size="md"
                    aria-label={t`Revision history`}
                    onClick={handleShowHistory}
                    data-hide-on-print
                  >
                    <Icon name="history" />
                  </ActionIcon>
                </Box>
              </Tooltip>
            )}
          </Group>
          <Box w="100%" maw="42.5rem" mx="auto">
            <Editor
              // avoid sharing state like undo/redo history between documents
              key={documentData?.id}
              capabilities={SUMMARY_CAPABILITIES}
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
        </Stack>
      </Stack>

      {selectedQuestionId && selectedEmbedIndex !== null && editorInstance && (
        <Box className={S.sidebar} data-testid="document-card-sidebar">
          <EmbedQuestionSettingsSidebar
            cardId={selectedQuestionId}
            editorInstance={editorInstance}
          />
        </Box>
      )}

      <LeaveRouteConfirmModal isEnabled={showSaveButton} />

      {isHistorySidebarOpen && documentData && (
        <Box className={S.sidebar} data-testid="document-history-sidebar">
          <DocumentRevisionHistorySidebar
            document={documentData}
            onClose={() => dispatch(setIsHistorySidebarOpen(false))}
          />
        </Box>
      )}
    </>
  );
}
