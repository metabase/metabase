import type { JSONContent } from "@tiptap/core";
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
import { DOCUMENT_TITLE_MAX_LENGTH } from "metabase/documents/constants";
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
  Center,
  Group,
  Icon,
  Stack,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ExplorationDocument, ExplorationId } from "metabase-types/api";

import S from "./ExplorationDocument.module.css";
import { ExplorationDocumentSkeleton } from "./ExplorationDocumentSkeleton";

export type ExplorationDocumentWithIsAiSummary = ExplorationDocument & {
  isAiSummary: boolean;
  isCanceled: boolean;
};

interface ExplorationDocumentProps {
  explorationId: ExplorationId;
  document: ExplorationDocumentWithIsAiSummary;
  isCommentsSidebarOpen: boolean;
  childTargetId?: string;
  route: Route;
  locationSearch: string;
}

export function ExplorationDocument({
  explorationId,
  document,
  isCommentsSidebarOpen,
  childTargetId,
  route,
  locationSearch,
}: ExplorationDocumentProps) {
  const { isAiSummary, isCanceled } = document;

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

  if (error) {
    return (
      <Center w="100%" mih="20rem">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  if (isDocumentLoading) {
    return <ExplorationDocumentSkeleton />;
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
          bg="background-primary"
          bd="1px solid border"
          bdrs="md"
          p="lg"
          pt="5rem"
          gap={0}
        >
          <Group h="2.5rem" w="100%" maw="42.5rem" mx="auto">
            <EditableText
              initialValue={documentTitle}
              onContentChange={setDocumentTitle}
              placeholder="New Document"
              fw="bold"
              fz="h3"
              lh="h3"
              isDisabled={!canWrite || isSaving || isAiSummary}
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
            {hasComments && (
              <Tooltip label={t`Show all comments`}>
                <Box>
                  <ActionIcon
                    component={Link}
                    to={{
                      pathname: Urls.explorationDocumentComments(
                        explorationId,
                        document.id,
                      ),
                      search: locationSearch,
                    }}
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
                dispatch(
                  push({
                    pathname: Urls.exploration(explorationId),
                    search: locationSearch,
                  }),
                );
              }}
            />
          </Group>
          <Box w="100%" maw="42.5rem" mx="auto">
            <Editor
              // avoid sharing state like undo/redo history between documents
              key={documentData?.id}
              onEditorReady={setEditorInstance}
              onCardEmbedsChange={updateCardEmbeds}
              onQuestionSelect={handleQuestionSelect}
              initialContent={
                isCanceled
                  ? getCanceledAiSummaryDocumentContent()
                  : documentContent
              }
              onChange={handleChange}
              editable={canWrite && !isSaving && !isAiSummary}
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

function getCanceledAiSummaryDocumentContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: t`AI Summary generation was stopped.`,
            marks: [
              {
                type: "italic",
              },
            ],
          },
        ],
      },
    ],
  };
}
