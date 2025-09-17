import type { ReactNode } from "react";
import { t } from "ttag";

import { MetabotGreeting } from "metabase/home/components/HomeGreeting";
import { ActionIcon, Group, Icon, Stack, Text } from "metabase/ui";

import { EmbeddingHub } from "./EmbeddingHub";

/**
 * Embedding Hub shown in the embedding home page for admins in EE instances.
 */
export const EmbeddingHubHomePage = (): ReactNode => {
  return (
    <Stack mx="auto" py="xl" maw={800}>
      <Group gap="sm" justify="space-between" mb="xl">
        <Group gap="sm">
          <MetabotGreeting />

          <Text
            fw={700}
            fz="lg"
          >{t`Get started with Embedded Analytics JS`}</Text>
        </Group>

        <ActionIcon variant="subtle" aria-label={t`More options`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Group>

      <EmbeddingHub />
    </Stack>
  );
};
