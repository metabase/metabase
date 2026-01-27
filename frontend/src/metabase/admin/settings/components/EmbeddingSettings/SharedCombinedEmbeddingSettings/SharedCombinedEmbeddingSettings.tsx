import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { EmbeddingSettingsCard } from "metabase/admin/settings/components/EmbeddingSettings";
import { NewEmbedButton } from "metabase/admin/settings/components/EmbeddingSettings/NewEmbedButton/NewEmbedButton";
import { UpsellBanner } from "metabase/admin/upsells/components";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  PLUGIN_CONTENT_TRANSLATION,
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP,
} from "metabase/plugins";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { Box, Text } from "metabase/ui";

import { SettingTitle } from "../../SettingHeader";
import { EmbeddedResources } from "../../widgets/PublicLinksListing/EmbeddedResources";
import { EmbeddingSecretKeyWidget } from "../EmbeddingSecretKeyWidget";
import { CorsInputWidget } from "../EmbeddingSecuritySettings/CorsInputWidget";

type Props = {
  showEmbeddingSdkSettings?: boolean;
  showCorsSettings?: boolean;
  showContentTranslationSettings?: boolean;
};

export function SharedCombinedEmbeddingSettings({
  showCorsSettings,
  showContentTranslationSettings,
}: Props) {
  const isSimpleEmbedFeatureAvailable =
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled();
  const isGuestEmbedsEnabled = useSetting("enable-embedding-static");

  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, { utm_content: "embedding-settings" }),
  );

  return (
    <>
      <EmbeddingSettingsCard
        title={t`Enable guest embeds`}
        description={t`A secure way to embed charts and dashboards, without single sign-on, when you don’t want to offer ad-hoc querying or chart drill-through.`}
        settingKey="enable-embedding-static"
        actionButton={<NewEmbedButton />}
        sdk-setting-card
        testId="guest-embeds-setting-card"
      />

      {!isSimpleEmbedFeatureAvailable && (
        <UpsellBanner
          title={t`Upgrade to Metabase Pro for more powerful embedding methods`}
          campaign="embedded-analytics-js"
          location="embedding-page"
          buttonText={t`Upgrade`}
          buttonLink={upgradeUrl}
          dismissible
        >
          <Text c="text-secondary" lh="md">
            {t`Embed charts, dashboards with drill-throughs, or even the query builder into your own application using customizable components. Secure your embeds with single sign-on.`}
          </Text>
        </UpsellBanner>
      )}

      <SettingsSection>
        <EmbeddingSecretKeyWidget />
      </SettingsSection>

      {isGuestEmbedsEnabled && (
        <SettingsSection>
          <Box data-testid="embedded-resources">
            <SettingTitle
              id="static-embeds"
              fz="lg"
              mb="md"
            >{t`Published embeds`}</SettingTitle>

            <EmbeddedResources />
          </Box>
        </SettingsSection>
      )}

      {showCorsSettings && (
        <SettingsSection>
          <CorsInputWidget />
        </SettingsSection>
      )}

      {showContentTranslationSettings && (
        <PLUGIN_CONTENT_TRANSLATION.ContentTranslationConfiguration />
      )}
    </>
  );
}
