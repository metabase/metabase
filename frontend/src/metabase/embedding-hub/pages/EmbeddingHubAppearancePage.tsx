import { t } from "ttag";

import { EmbeddingThemeListingApp } from "metabase/admin/embedding/components/ThemeListing";
import { UpsellEmbeddingTheme } from "metabase/admin/upsells";
import { Link } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_WHITELABEL } from "metabase/plugins";
import { useSetting } from "metabase/settings";
import { Card, Group, Icon, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";

/**
 * The embedding theme editor plus the appearance settings that show up inside
 * an embed. One tab, not two -- there is no separate Themes tab in the design.
 *
 * Gated as a whole. The two halves are technically gated on different features
 * -- themes on `embedding_simple`, the appearance settings on `whitelabel` --
 * but in practice they arrive together, so a partial state is not worth
 * building.
 */
export function EmbeddingHubAppearancePage() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const isFullAppEmbeddingEnabled = useSetting("enable-embedding-interactive");

  return (
    <Stack gap="2.5rem">
      <Title order={1} c="text-primary">{t`Appearance`}</Title>

      {!hasSimpleEmbedding && (
        <UpsellEmbeddingTheme source="embedding-hub-appearance" />
      )}

      {hasSimpleEmbedding && (
        <>
          <Stack gap="md">
            <Title order={4}>{t`Themes`}</Title>

            <EmbeddingThemeListingApp
              basePath={Urls.embeddingHubAppearance()}
              showHeading={false}
            />
          </Stack>

          <Stack gap="md">
            <Title order={4}>{t`Branding elements`}</Title>

            <PLUGIN_WHITELABEL.EmbeddedAppearanceSettings />
          </Stack>

          {/* Per the design's annotation: only when full-app embedding is on. */}
          {isFullAppEmbeddingEnabled && <FullAppAppearanceBanner />}
        </>
      )}
    </Stack>
  );
}

function FullAppAppearanceBanner() {
  return (
    <Card p="md" withBorder bg="background-info">
      <Group gap="xs" wrap="nowrap">
        <Text c="text-secondary">
          {t`Colors and branding of Full-app embedding are based on the appearance settings defined in the`}
        </Text>

        <Link to="/admin/settings/whitelabel">
          <Group gap={4} wrap="nowrap">
            <Text c="brand" fw="bold">{t`Admin`}</Text>
            <Icon name="external" size={12} c="brand" />
          </Group>
        </Link>
      </Group>
    </Card>
  );
}
