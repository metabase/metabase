import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { trackDocumentUpdated } from "metabase/documents/analytics";
import { DocumentRevisionHistorySidebar } from "metabase/documents/components/DocumentRevisionHistorySidebar";
import { Editor } from "metabase/documents/components/Editor";
import { EmbedQuestionSettingsSidebar } from "metabase/documents/components/EmbedQuestionSettingsSidebar";
import { DOCUMENT_TITLE_MAX_LENGTH } from "metabase/documents/constants";
import {
  setChildTargetId,
  setIsHistorySidebarOpen,
} from "metabase/documents/documents.slice";
import { useDocumentEditor } from "metabase/documents/hooks/use-document-editor";
import {
  getIsHistorySidebarOpen,
  getSelectedEmbedIndex,
  getSelectedQuestionId,
} from "metabase/documents/selectors";
import { useDispatch, useSelector } from "metabase/redux";
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
import type { ExplorationDocument, ExplorationId } from "metabase-types/api";

import { ExplorationComments } from "../ExplorationVisualization/ExplorationComments";

import {
  ExplorationIdProvider,
  explorationEditorHost,
} from "./ExplorationEditorHost";
import S from "./ExplorationSummary.module.css";
import { ExplorationSummarySkeleton } from "./ExplorationSummarySkeleton";

interface ExplorationSummaryProps {
  document: ExplorationDocument;
  explorationId: ExplorationId;
  commentsChildTargetId?: string;
  onCloseCommentsSidebar: () => void;
}

export function ExplorationSummary({
  document,
  explorationId,
  commentsChildTargetId,
  onCloseCommentsSidebar,
}: ExplorationSummaryProps) {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setChildTargetId(commentsChildTargetId));
  }, [commentsChildTargetId, dispatch]);

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

  const showCommentsSidebar = commentsChildTargetId != null;

  return (
    <>
      <Box flex={1} h="100%" pb="3rem" pr="1rem">
        <Box bg="background-primary" bd="1px solid border" bdrs="md" h="100%">
          <Group gap={0} h="100%">
            <Stack
              h="100%"
              flex={1}
              p="lg"
              pr={showCommentsSidebar ? "5rem" : "lg"}
              pt="3rem"
              gap={0}
              style={{ overflowY: "auto" }}
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
                    <ActionIcon
                      size="md"
                      aria-label={t`Revision history`}
                      onClick={handleShowHistory}
                      data-hide-on-print
                    >
                      <Icon name="history" c="icon-primary" />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
              <Box w="100%" maw="42.5rem" mx="auto">
                <ExplorationIdProvider explorationId={explorationId}>
                  <Editor
                    hostOverride={explorationEditorHost}
                    onEditorReady={setEditorInstance}
                    onCardEmbedsChange={updateCardEmbeds}
                    onQuestionSelect={handleQuestionSelect}
                    initialContent={documentContent}
                    onChange={handleChange}
                    editable={canWrite && !isSaving}
                    isLoading={isDocumentLoading}
                    editorContainerRef={editorContainerRef}
                  />
                </ExplorationIdProvider>
              </Box>
            </Stack>
            {showCommentsSidebar && (
              <Box
                w="23rem"
                h="100%"
                className={S.commentsSidebar}
                data-testid="exploration-summary-comments"
              >
                <ExplorationComments
                  explorationId={explorationId}
                  pageId={commentsChildTargetId}
                  onClose={onCloseCommentsSidebar}
                />
              </Box>
            )}
            {selectedQuestionId &&
              selectedEmbedIndex !== null &&
              editorInstance && (
                <Box className={S.sidebar} data-testid="document-card-sidebar">
                  <EmbedQuestionSettingsSidebar
                    cardId={selectedQuestionId}
                    editorInstance={editorInstance}
                  />
                </Box>
              )}
          </Group>
        </Box>
      </Box>

      <LeaveRouteConfirmModal isEnabled={showSaveButton} />

      {isHistorySidebarOpen && documentData && (
        <Box data-testid="document-history-sidebar">
          <DocumentRevisionHistorySidebar
            document={documentData}
            onClose={() => dispatch(setIsHistorySidebarOpen(false))}
          />
        </Box>
      )}
    </>
  );
}
