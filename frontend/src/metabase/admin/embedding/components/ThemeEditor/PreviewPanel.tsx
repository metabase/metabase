import { t } from "ttag";

import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box, Center, Flex, Text } from "metabase/ui";

import S from "./PreviewPanel.module.css";

export function PreviewPanel({ settings }: { settings: MetabaseTheme }) {
  return (
    <Flex
      direction="column"
      flex={1}
      style={{ backgroundColor: "var(--mb-color-bg-light)" }}
    >
      <Box p="xl" pb="sm">
        <Text fw={700} fz="xl">{t`Theme preview`}</Text>
      </Box>
      <Box flex={1} p="xl" pt="sm" style={{ overflow: "hidden" }}>
        <Box
          className={S.PreviewContainer}
          h="100%"
          style={{ backgroundColor: settings?.colors?.background }}
        >
          <Center h="100%">
            <Text c="text-secondary">{t`Preview will appear here`}</Text>
          </Center>
        </Box>
      </Box>
    </Flex>
  );
}
