import { t } from "ttag";

import { Box, Stack, Text, Title } from "metabase/ui";

import {
  EmbeddingSdkOptionCard,
  InteractiveEmbeddingOptionCard,
  StaticEmbeddingOptionCard,
} from "../EmbeddingSettings/EmbeddingOption";

export function EmbeddingSettingsPage() {
  return (
    <Stack gap="2.5rem">
      <Box>
        <Title order={1}>{t`Embedding`}</Title>
        <Text>
          {t`Embed dashboards, questions, or the entire Metabase app into your application. Integrate with your server code to create a secure environment, limited to specific users or organizations.`}
        </Text>
      </Box>
      <StaticEmbeddingOptionCard />
      <InteractiveEmbeddingOptionCard />
      <EmbeddingSdkOptionCard />
    </Stack>
  );
}
