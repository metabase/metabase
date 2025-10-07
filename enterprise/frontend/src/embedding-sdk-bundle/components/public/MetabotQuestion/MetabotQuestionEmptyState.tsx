import { t } from "ttag";

import { Icon, Stack, Text } from "metabase/ui";

export const MetabotQuestionEmptyState = () => (
  <Stack h="100%" w="100%" gap="lg" align="center" justify="center">
    <Icon name="ai" c="var(--mb-color-bg-black)" size="5rem" opacity={0.25} />

    <Stack gap="xs" align="center">
      <Text lh="md">{t`Ask questions to AI.`}</Text>
      <Text lh="md">{t`Results will appear here.`}</Text>
    </Stack>
  </Stack>
);
