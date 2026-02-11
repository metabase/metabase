import { t } from "ttag";

import {
  RelatedSettingsSection,
  getModularEmbeddingRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { Stack, Text, Title } from "metabase/ui";

import { EmbeddingHub } from "./EmbeddingHub";

export const EmbeddingHubAdminSettingsPage = () => {
  const isUsingTenants = useSetting("use-tenants");
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  return (
    <Stack mx="auto" py="xl" gap="xl" maw={800}>
      <Stack gap="xs">
        <Title order={1} c="text-primary">{t`Embedding setup guide`}</Title>

        <Text c="text-secondary">{t`Follow the guide to get started with modular embedding`}</Text>
      </Stack>

      <EmbeddingHub />

      <Stack ml="2.7rem">
        <RelatedSettingsSection
          items={getModularEmbeddingRelatedSettingItems({
            isUsingTenants,
            hasSimpleEmbedding,
          })}
        />
      </Stack>
    </Stack>
  );
};
