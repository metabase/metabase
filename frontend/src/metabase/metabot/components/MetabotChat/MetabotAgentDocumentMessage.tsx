import { t } from "ttag";

import { useGetDocumentQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { Editor } from "metabase/documents/components/Editor";
import { Box, Flex, Icon, Loader, Text } from "metabase/ui";
import * as Urls from "metabase/urls";

export const AgentDocumentMessage = ({
  documentId,
}: {
  documentId: number;
}) => {
  const { data: document, isLoading } = useGetDocumentQuery({ id: documentId });

  if (isLoading || !document) {
    return (
      <Flex align="center" gap="sm" p="md">
        <Loader size="sm" />
        <Text c="text-secondary">{t`Building your document…`}</Text>
      </Flex>
    );
  }

  return (
    <Box
      data-testid="metabot-document-message"
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: "var(--mantine-radius-md)",
        overflow: "hidden",
      }}
    >
      {/* White "paper" the width of a US Letter page (8.5 x 11), but only half
          its height tall — 8.5 x (11/2) → 17 : 11 — so it reads as a page
          preview that scrolls if the content runs long. */}
      <Box
        bg="white"
        p="lg"
        style={{ aspectRatio: "17 / 11", overflowY: "auto" }}
      >
        <Editor initialContent={document.document} editable={false} />
      </Box>
      <Flex
        align="center"
        justify="flex-end"
        p="sm"
        style={{ borderTop: "1px solid var(--mb-color-border)" }}
      >
        <Link to={Urls.document(document)}>
          <Flex align="center" gap="xs" c="brand">
            <Icon name="document" size={14} />
            <Text c="brand" fw={600}>{t`Open document`}</Text>
          </Flex>
        </Link>
      </Flex>
    </Box>
  );
};
