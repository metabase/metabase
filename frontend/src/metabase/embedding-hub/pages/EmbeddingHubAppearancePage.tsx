import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { AppearanceUpsellPage } from "metabase/embedding-hub/upsells";
import { EmbeddingThemeListingApp } from "metabase/embedding/themes/components/ThemeListing";
import { PLUGIN_WHITELABEL } from "metabase/plugins";
import { useSetting } from "metabase/settings";
import { SettingsPageWrapper } from "metabase/settings-components/SettingsSection";
import { Card, Icon, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";

/**
 * Combines the embedding theme editor and the branding settings into one tab.
 * Both are gated on `hasSimpleEmbedding`, even though the branding settings
 * alone gate on `whitelabel`, since the two features ship together.
 */
export function EmbeddingHubAppearancePage() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const isFullAppEmbeddingEnabled = useSetting("enable-embedding-interactive");

  if (!hasSimpleEmbedding) {
    return <AppearanceUpsellPage />;
  }

  return (
    <SettingsPageWrapper title={t`Appearance`}>
      <Stack gap="lg">
        <Title order={4}>{t`Themes`}</Title>

        <EmbeddingThemeListingApp
          basePath={`${Urls.embeddingHubAppearance()}/theme`}
          showHeading={false}
        />
      </Stack>

      <Stack gap="lg">
        <Title order={4}>{t`Branding elements`}</Title>

        <PLUGIN_WHITELABEL.EmbeddedAppearanceSettings />
      </Stack>

      {/* Per the design's annotation: only when full-app embedding is on. */}
      {isFullAppEmbeddingEnabled && <FullAppAppearanceBanner />}
    </SettingsPageWrapper>
  );
}

function FullAppAppearanceBanner() {
  return (
    <Card p="lg" bg="background-brand">
      {/* One flowing sentence, not a Group of rigid parts -- the link needs
          to wrap inline with the text on narrow screens rather than being
          pushed onto its own line. */}
      <Text c="text-secondary">
        {t`Colors and branding for full-app embedding are based on the appearance settings defined in the`}{" "}
        <Link to="/admin/settings/whitelabel">
          <Text component="span" c="brand" fw="bold">{t`Admin`}</Text>{" "}
          <Icon name="external" size={12} c="brand" />
        </Link>
      </Text>
    </Card>
  );
}
