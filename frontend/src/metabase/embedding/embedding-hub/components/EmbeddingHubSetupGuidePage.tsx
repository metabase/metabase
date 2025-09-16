import { t } from "ttag";

import {
  RelatedSettingsSection,
  getModularEmbeddingRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import { Stack, Text, Title } from "metabase/ui";

import { EmbeddingHub } from "./EmbeddingHub";

export const EmbeddingHubSetupGuidePage = () => {
  return (
    <Stack mx="auto" py="xl" gap="xl" maw={800}>
      <Stack gap="xs" ml="3rem">
        <Title
          order={1}
          c="var(--mb-color-text-primary)"
        >{t`Embedding setup guide`}</Title>

        <Text c="var(--mb-color-text-secondary)">{t`Follow the guide to get started with Embedded Analytics JS`}</Text>
      </Stack>

      <EmbeddingHub />

      <RelatedSettingsSection
        items={getModularEmbeddingRelatedSettingItems()}
      />
    </Stack>
  );
};
