import { useCallback, useEffect } from "react";
import { Link, type Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListCommentsQuery } from "metabase/api";
import { EditableText } from "metabase/common/components/EditableText";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DocumentMenu } from "metabase/documents/components/DocumentMenu";
import { DocumentRevisionHistorySidebar } from "metabase/documents/components/DocumentRevisionHistorySidebar";
import { Editor } from "metabase/documents/components/Editor";
import { EmbedQuestionSettingsSidebar } from "metabase/documents/components/EmbedQuestionSettingsSidebar";
import { TimelineEventsSidebar } from "metabase/documents/components/TimelineEventsSidebar";
import {
  setChildTargetId,
  setDocumentHost,
  setIsHistorySidebarOpen,
} from "metabase/documents/documents.slice";
import { useDocumentEditor } from "metabase/documents/hooks/use-document-editor";
import {
  getIsHistorySidebarOpen,
  getSelectedEmbedIndex,
  getSelectedQuestionId,
  getSidebarMode,
} from "metabase/documents/selectors";
import { getListCommentsQuery } from "metabase/documents/utils/api";
import { useDispatch, useSelector } from "metabase/redux";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ExplorationDocument, ExplorationId } from "metabase-types/api";

import S from "./ExplorationDocument.module.css";

export type ExplorationDocumentWithIsAutoInsights = ExplorationDocument & {
  isAutoInsights: boolean;
};

interface ExplorationDocumentProps {
  explorationId: ExplorationId;
  document: ExplorationDocumentWithIsAutoInsights;
  isCommentsSidebarOpen: boolean;
  childTargetId?: string;
  route: Route;
}

export function ExplorationDocument({
  explorationId,
  document,
  isCommentsSidebarOpen,
  childTargetId,
  route,
}: ExplorationDocumentProps) {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setDocumentHost("exploration"));
  }, [dispatch]);

  useEffect(() => {
    dispatch(setChildTargetId(childTargetId));
  }, [childTargetId, dispatch]);

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
    handleUpdate,
    handleQuestionSelect,
  } = useDocumentEditor({
    documentId: document.id,
  });

  const { hasComments } = useListCommentsQuery(
    getListCommentsQuery(documentData),
    {
      selectFromResult: ({ data }) => ({
        hasComments: !!data?.comments?.length,
      }),
    },
  );

  const selectedQuestionId = useSelector(getSelectedQuestionId);
  const selectedEmbedIndex = useSelector(getSelectedEmbedIndex);
  const sidebarMode = useSelector(getSidebarMode);
  const isHistorySidebarOpen = useSelector(getIsHistorySidebarOpen);

  const handleShowHistory = useCallback(() => {
    dispatch(setIsHistorySidebarOpen(true));
  }, [dispatch]);

  if (isDocumentLoading || error) {
    return <LoadingAndErrorWrapper loading={isDocumentLoading} error={error} />;
  }

  return (
    <>
      <Stack
        flex={1}
        h="100%"
        py="3rem"
        pr={isCommentsSidebarOpen ? "4rem" : "3rem"}
        align="center"
        style={{
          overflowY: "auto",
        }}
      >
        <Stack
          flex={1}
          w="100%"
          maw="59.25rem" // Editor max-width is 56.25 rem, plus 3 for padding
          bg="background-primary"
          bd="1px solid border"
          bdrs="md"
          p="lg"
          gap={0}
        >
          <Group h="2.5rem">
            <EditableText
              initialValue={documentTitle}
              onContentChange={setDocumentTitle}
              placeholder="New Document"
              fw="bold"
              fz="h3"
              lh="h3"
              isDisabled={!canWrite || isSaving || document.isAutoInsights}
              p={0}
              flex={1}
            />
            {showSaveButton && (
              <Button
                variant="filled"
                onClick={() => handleSave()}
                data-hide-on-print
              >{t`Save`}</Button>
            )}
            {hasComments && (
              <Tooltip label={t`Show all comments`}>
                <Box>
                  <ActionIcon
                    className={S.commentsIcon}
                    component={Link}
                    to={Urls.explorationDocumentComments(
                      explorationId,
                      document.id,
                    )}
                    size="md"
                    aria-label={t`Show all comments`}
                    data-hide-on-print
                  >
                    <Icon name="comment" />
                  </ActionIcon>
                </Box>
              </Tooltip>
            )}
            <DocumentMenu
              document={documentData}
              canWrite={canWrite}
              disablePrint={true}
              onShowHistory={handleShowHistory}
              onArchive={() => {
                handleUpdate({ archived: true });
                // navigate back to the exploration page
                // otherwise nothing will be appearing on the page
                dispatch(push(Urls.exploration(explorationId)));
              }}
            />
          </Group>
          <Box w="100%">
            <Editor
              // avoid sharing state like undo/redo history between documents
              key={documentData?.id}
              onEditorReady={setEditorInstance}
              onCardEmbedsChange={updateCardEmbeds}
              onQuestionSelect={handleQuestionSelect}
              initialContent={documentContent}
              onChange={handleChange}
              editable={canWrite && !isSaving && !document.isAutoInsights}
              isLoading={isDocumentLoading}
              editorContainerRef={editorContainerRef}
            />
          </Box>
        </Stack>
      </Stack>

      {selectedQuestionId &&
        selectedEmbedIndex !== null &&
        editorInstance &&
        sidebarMode === "viz-settings" && (
          <Box className={S.sidebar} data-testid="document-card-sidebar">
            <EmbedQuestionSettingsSidebar
              cardId={selectedQuestionId}
              editorInstance={editorInstance}
            />
          </Box>
        )}

      {selectedQuestionId &&
        selectedEmbedIndex !== null &&
        editorInstance &&
        sidebarMode === "timeline-events" && (
          <Box className={S.sidebar} data-testid="document-timeline-sidebar">
            <TimelineEventsSidebar
              cardId={selectedQuestionId}
              selectedEmbedIndex={selectedEmbedIndex}
              editorInstance={editorInstance}
              collectionId={documentData?.collection_id ?? null}
            />
          </Box>
        )}

      <LeaveRouteConfirmModal
        // the confirm modal open state only resets when `route` changes
        // and the route doesn't change when picking a different document
        // so use the document id as the key to reset the modal state
        key={documentData?.id}
        isEnabled={showSaveButton}
        route={route}
      />

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
