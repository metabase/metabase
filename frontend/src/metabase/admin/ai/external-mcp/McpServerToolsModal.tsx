import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Modal, Stack, Text } from "metabase/ui";
import type { McpServer } from "metabase-types/api";

import { useListMcpServerToolsQuery } from "../../settings/api/mcp-client";

export function McpServerToolsModal({
  server,
  onClose,
}: {
  server: McpServer;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useListMcpServerToolsQuery(server.id);
  const tools = data?.tools ?? [];

  return (
    <Modal
      size="40rem"
      padding="xxl"
      opened
      onClose={onClose}
      title={t`Tools from ${server.name}`}
    >
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        {tools.length === 0 ? (
          <Text c="text-secondary">{t`This server exposes no tools.`}</Text>
        ) : (
          <Stack gap="md" mah="60vh" style={{ overflowY: "auto" }}>
            {tools.map((tool) => (
              <Box key={tool.name}>
                <Text fw="bold">{tool.title ?? tool.name}</Text>
                {tool.title && (
                  <Text c="text-secondary" fz="sm" ff="monospace">
                    {tool.name}
                  </Text>
                )}
                {tool.description && (
                  <Text c="text-secondary" fz="sm">
                    {tool.description}
                  </Text>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </LoadingAndErrorWrapper>
    </Modal>
  );
}
