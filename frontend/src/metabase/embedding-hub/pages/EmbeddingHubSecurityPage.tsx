import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { EmbeddingMethodsCard } from "metabase/admin/settings/components/EmbeddingSettings";
import { EmbeddingSecretKeyWidget } from "metabase/admin/settings/components/EmbeddingSettings/EmbeddingSecretKeyWidget";
import { CorsInputWidget } from "metabase/admin/settings/components/EmbeddingSettings/EmbeddingSecuritySettings/CorsInputWidget";
import { SameSiteSelectWidget } from "metabase/admin/settings/components/EmbeddingSettings/EmbeddingSecuritySettings/SameSiteSelectWidget";
import { SettingTitle } from "metabase/admin/settings/components/SettingHeader";
import { EmbeddedResources } from "metabase/admin/settings/components/widgets/PublicLinksListing/EmbeddedResources";
import {
  useListEmbeddableCardsQuery,
  useListEmbeddableDashboardsQuery,
} from "metabase/api";
import { UpsellBanner } from "metabase/common/components/upsells/components";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { useSetting } from "metabase/settings";
import { Box } from "metabase/ui";

const UPSELL_CAMPAIGN = "embedding-hub";
const UPSELL_LOCATION = "embedding-hub-security";

/**
 * Card order comes from the design: embedding methods, CORS, SameSite, secret
 * key, then the two conditional cards.
 *
 * The hub has no Guest embeds tab, so this page carries what admin settings'
 * Guest embeds page holds today: the Enable guest embeds toggle, the secret
 * key and the published embeds list.
 */
export function EmbeddingHubSecurityPage() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, {
      utm_campaign: UPSELL_CAMPAIGN,
      utm_content: UPSELL_LOCATION,
    }),
  );
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign: UPSELL_CAMPAIGN,
    location: UPSELL_LOCATION,
  });
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
        <UpsellBanner
          title={t`Upgrade to Metabase Pro to access the SDK for React and more advanced options.`}
          campaign={UPSELL_CAMPAIGN}
          location={UPSELL_LOCATION}
          buttonText={t`Try Metabase Pro`}
          buttonLink={upgradeUrl}
          onClick={triggerUpsellFlow}
          large
        />
      )}

      <SettingsSection>
        <CorsInputWidget />
      </SettingsSection>

      {/* SameSite governs the metabase.SESSION cookie, and guest embeds never
          set one (src/metabase/request/cookies.clj:71-81). Guest is the only
          method below the paywall, so the setting is inert there -- showing it
          invites an admin to change a value that cannot affect their embeds. */}
      {hasSimpleEmbedding && (
        <SettingsSection>
          <SameSiteSelectWidget />
        </SettingsSection>
      )}

      <SettingsSection>
        <EmbeddingSecretKeyWidget />
      </SettingsSection>

      {/* Per the design's annotation: only when published guest embeds exist. */}
      {hasPublishedGuestEmbeds && (
        <SettingsSection>
          <Box data-testid="embedded-resources">
            <SettingTitle
              id="static-embeds"
              fz="lg"
              mb="lg"
            >{t`Published guest embeds`}</SettingTitle>

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
