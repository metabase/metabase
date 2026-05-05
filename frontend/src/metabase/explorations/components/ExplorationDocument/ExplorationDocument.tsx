import { useEffect } from "react";

import { useGetDocumentQuery } from "metabase/api/document";
import { EditableText } from "metabase/common/components/EditableText";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Editor } from "metabase/documents/components/Editor";
import { setCurrentDocument } from "metabase/documents/documents.slice";
import { useDispatch } from "metabase/redux";
import { Box, Stack } from "metabase/ui";
import type { ExplorationDocument } from "metabase-types/api";

interface ExplorationDocumentProps {
  document: ExplorationDocument;
}

export function ExplorationDocument({ document }: ExplorationDocumentProps) {
  const {
    data: documentData,
    isLoading,
    error,
  } = useGetDocumentQuery({ id: document.id });

  const dispatch = useDispatch();

  useEffect(() => {
    if (documentData) {
      dispatch(setCurrentDocument(documentData));
    }
  }, [documentData, dispatch]);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }
  if (!documentData) {
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
        <EditableText
          initialValue={documentData.name}
          placeholder="New Document"
          fw="bold"
          fz="h3"
          lh="h3"
          isDisabled // todo fixme
          p={0}
          w="100%"
        />
        <Box w="100%">
          <Editor initialContent={documentData.document} />
        </Box>
      </Stack>
    </Stack>
  );
}
