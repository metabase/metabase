import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Editor } from "metabase/documents/components/Editor";
import { useDocumentEditor } from "metabase/documents/hooks/use-document-editor";
import { Box, Button, Group, Stack } from "metabase/ui";
import type { ExplorationDocument } from "metabase-types/api";

interface ExplorationDocumentProps {
  document: ExplorationDocument;
}

export function ExplorationDocument({ document }: ExplorationDocumentProps) {
  const {
    setEditorInstance,
    editorContainerRef,
    isDocumentLoading,
    error,
    canWrite,
    isSaving,
    documentTitle,
    setDocumentTitle,
    documentContent,
    updateCardEmbeds,
    handleChange,
    showSaveButton,
    handleSave,
  } = useDocumentEditor({
    documentId: document.id,
  });

  if (isDocumentLoading || error) {
    return <LoadingAndErrorWrapper loading={isDocumentLoading} error={error} />;
  }
  if (!documentContent) {
    return null;
  }
  return (
    <Stack
      flex={1}
      h="100%"
      py="3rem"
      pr="3rem"
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
            onEditorReady={setEditorInstance}
            onCardEmbedsChange={updateCardEmbeds}
            initialContent={documentContent}
            onChange={handleChange}
            editable={canWrite && !isSaving}
            isLoading={isDocumentLoading}
            editorContainerRef={editorContainerRef}
          />
        </Box>
      </Stack>
    </Stack>
  );
}
