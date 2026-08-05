import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  EmbeddingMethodsCard,
  EmbeddingSecurityWidgets,
} from "metabase/admin/settings/components/EmbeddingSettings";
import { EmbeddingSecretKeyWidget } from "metabase/admin/settings/components/EmbeddingSettings/EmbeddingSecretKeyWidget";
import { EmbeddedResources } from "metabase/admin/settings/components/widgets/PublicLinksListing/EmbeddedResources";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { useSetting } from "metabase/settings";
import { Box, Title } from "metabase/ui";

/**
 * Card order comes from the design: embedding methods, CORS, SameSite, secret
 * key, then the two conditional cards.
 *
 * Security absorbs the standalone Guest embeds page -- the design has no
 * separate "Enable guest embeds" screen.
 */
export function EmbeddingHubSecurityPage() {
  const isGuestEmbedsEnabled = useSetting("enable-embedding-static");
  const isFullAppEmbeddingEnabled = useSetting("enable-embedding-interactive");

  return (
    <SettingsPageWrapper title={t`Security`}>
      <EmbeddingMethodsCard />

      <EmbeddingSecurityWidgets />

      <SettingsSection>
        <EmbeddingSecretKeyWidget />
      </SettingsSection>

      {/* Per the design's annotation: only when published guest embeds exist. */}
      {isGuestEmbedsEnabled && (
        <SettingsSection>
          <Box data-testid="embedded-resources">
            <Title order={4} mb="md">{t`Published guest embeds`}</Title>

            <EmbeddedResources />
          </Box>
        </SettingsSection>
      )}

      {/* Per the design's annotation: only when full-app embedding is on. */}
      {isFullAppEmbeddingEnabled &&
        PLUGIN_ADMIN_SETTINGS.InteractiveEmbeddingAuthorizedOriginsWidget && (
          <SettingsSection>
            <PLUGIN_ADMIN_SETTINGS.InteractiveEmbeddingAuthorizedOriginsWidget />
          </SettingsSection>
        )}
    </SettingsPageWrapper>
  );
}
