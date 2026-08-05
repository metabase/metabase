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
import { UpsellBanner } from "metabase/common/components/upsells/components";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";
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
  const isGuestEmbedsEnabled = useSetting("enable-embedding-static");
  const isFullAppEmbeddingEnabled = useSetting("enable-embedding-interactive");

  return (
    <SettingsPageWrapper title={t`Security`}>
      <EmbeddingMethodsCard />

      {!hasSimpleEmbedding && <SdkUpsellBanner />}

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

/** The OSS design puts this directly under the methods card. */
function SdkUpsellBanner() {
  const campaign = "embedding-methods";
  const location = "embedding-hub-security";

  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, { utm_campaign: campaign, utm_content: location }),
  );
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  return (
    <UpsellBanner
      title={t`Upgrade to Metabase Pro to access the SDK for React and more advanced options.`}
      campaign={campaign}
      location={location}
      buttonText={t`Try Metabase Pro`}
      buttonLink={upgradeUrl}
      onClick={triggerUpsellFlow}
    >
      {null}
    </UpsellBanner>
  );
}
