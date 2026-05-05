import { useGetDocumentQuery } from "metabase/api/document";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Editor } from "metabase/documents/components/Editor";
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
      <Box
        flex={1}
        w="100%"
        maw="70rem"
        bg="background-primary"
        bd="1px solid border"
        bdrs="md"
        p="lg"
      >
        <Editor initialContent={documentData.document} />
      </Box>
    </Stack>
  );
}
