import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box, Flex, Text } from "metabase/ui";

import { DashboardPreviewLoader } from "./DashboardPreview";
import { EnableEmbeddingPrompt } from "./EnableEmbeddingPrompt";

export function PreviewPanel({ settings }: { settings: MetabaseTheme }) {
  const isSimpleEmbeddingEnabled = useSetting("enable-embedding-simple");
  const isTermsAccepted = !useSetting("show-simple-embed-terms");

  const isEmbeddingReady = isSimpleEmbeddingEnabled && isTermsAccepted;

  return (
    <Flex direction="column" flex={1} bg="background-secondary">
      <Box p="xl" pb="sm">
        <Text fw={700} fz="xl">{t`Theme preview`}</Text>
      </Box>
      <Box flex={1} p="xl" pt="sm" style={{ overflow: "hidden" }}>
        {isEmbeddingReady ? (
          <DashboardPreviewLoader theme={settings} />
        ) : (
          <EnableEmbeddingPrompt
            isEnabled={isSimpleEmbeddingEnabled}
            isTermsAccepted={isTermsAccepted}
          />
        )}
      </Box>
    </Flex>
  );
}
