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
 * Combines the embedding theme editor and the branding settings into one tab.
 * Both are gated on `hasSimpleEmbedding`, even though the branding settings
 * alone gate on `whitelabel`, since the two features ship together.
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
