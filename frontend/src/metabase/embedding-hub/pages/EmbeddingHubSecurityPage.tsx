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
import {
  useListEmbeddableCardsQuery,
  useListEmbeddableDashboardsQuery,
} from "metabase/api";
import { useHasTokenFeature } from "metabase/common/hooks";
import { UpsellProBanner } from "metabase/embedding-hub/components/UpsellProBanner";
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
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const isFullAppEmbeddingEnabled = useSetting("enable-embedding-interactive");

  // Keyed on whether anything is actually published, not on the toggle: an
  // admin who has just turned guest embeds off still needs to see what is
  // already out there, and that is exactly when they most need to.
  const { data: embeddedDashboards } = useListEmbeddableDashboardsQuery();
  const { data: embeddedCards } = useListEmbeddableCardsQuery();
  const hasPublishedGuestEmbeds =
    (embeddedDashboards?.length ?? 0) > 0 || (embeddedCards?.length ?? 0) > 0;

  return (
    <SettingsPageWrapper title={t`Security`}>
      <EmbeddingMethodsCard />

      {!hasSimpleEmbedding && (
        <UpsellProBanner
          title={t`Upgrade to Metabase Pro to access the SDK for React and more advanced options.`}
          location="embedding-hub-security"
        />
      )}

      <EmbeddingSecurityWidgets />

      <SettingsSection>
        <EmbeddingSecretKeyWidget />
      </SettingsSection>

      {/* Per the design's annotation: only when published guest embeds exist. */}
      {hasPublishedGuestEmbeds && (
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
