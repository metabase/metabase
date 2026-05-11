import { useEffect } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Editor } from "metabase/documents/components/Editor";
import { EmbedQuestionSettingsSidebar } from "metabase/documents/components/EmbedQuestionSettingsSidebar";
import { TimelineEventsSidebar } from "metabase/documents/components/TimelineEventsSidebar";
import {
  setChildTargetId,
  setDocumentHost,
} from "metabase/documents/documents.slice";
import { useDocumentEditor } from "metabase/documents/hooks/use-document-editor";
import {
  getSelectedEmbedIndex,
  getSelectedQuestionId,
  getSidebarMode,
} from "metabase/documents/selectors";
import { useDispatch, useSelector } from "metabase/redux";
import { Box, Button, Group, Stack } from "metabase/ui";
import type { ExplorationDocument } from "metabase-types/api";

import S from "./ExplorationDocument.module.css";

interface ExplorationDocumentProps {
  document: ExplorationDocument;
  isCommentsSidebarOpen: boolean;
  childTargetId?: string;
  route: Route;
}

export function ExplorationDocument({
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
    if (childTargetId) {
      dispatch(setChildTargetId(childTargetId));
    }
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
    handleQuestionSelect,
  } = useDocumentEditor({
    documentId: document.id,
  });

  const selectedQuestionId = useSelector(getSelectedQuestionId);
  const selectedEmbedIndex = useSelector(getSelectedEmbedIndex);
  const sidebarMode = useSelector(getSidebarMode);

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
              isDisabled={!canWrite || isSaving}
              p={0}
              flex={1}
            />
            {showSaveButton && (
              <Button
                variant="filled"
                onClick={() => handleSave()}
              >{t`Save`}</Button>
            )}
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
              editable={canWrite && !isSaving}
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
    </>
  );
}
