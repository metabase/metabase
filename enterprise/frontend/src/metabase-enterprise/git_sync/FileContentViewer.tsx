import Markdown from "metabase/common/components/Markdown";
import { Box, Code, Flex, ScrollArea, Stack, Text } from "metabase/ui";
import type { GitFileContent } from "metabase-enterprise/api";

interface FileContentViewerProps {
  content: GitFileContent;
}

export const FileContentViewer = ({ content }: FileContentViewerProps) => {
  return (
    <Flex h="100%" direction="column">
      <Box
        p="md"
        style={{
          borderBottom: "1px solid var(--mb-color-border)",
        }}
      >
        <Text size="md" c="text-medium">
          {content.path}
        </Text>
      </Box>
      <ScrollArea h="100%">
        <Box maw="900px" mx="auto" p="md">
          <Stack gap="md">
            {content.type === "markdown" ? (
              <Markdown>{content.content}</Markdown>
            ) : (
              <Code block p="md" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                {content.content}
              </Code>
            )}
          </Stack>
        </Box>
      </ScrollArea>
    </Flex>
  );
};
