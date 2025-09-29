import { t } from "ttag";

import {
  RelatedSettingsSection,
  getStaticEmbeddingRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { UpsellDevInstances } from "metabase/admin/upsells";
import { useSetting } from "metabase/common/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { Box } from "metabase/ui";

import { SettingTitle } from "../SettingHeader";
import { EmbeddedResources } from "../widgets/PublicLinksListing/EmbeddedResources";

import { EmbeddingSecretKeyWidget } from "./EmbeddingSecretKeyWidget";
import { EmbeddingToggle } from "./EmbeddingToggle";

export function StaticEmbeddingSettings() {
  const isStaticEmbeddingEnabled = useSetting("enable-embedding-static");

  return (
    <SettingsPageWrapper title={t`Static embedding`}>
      <SettingsSection>
        <EmbeddingToggle
          settingKey="enable-embedding-static"
          label={t`Enable static embedding`}
        />
        <EmbeddingSecretKeyWidget />

        {isStaticEmbeddingEnabled && (
          <Box data-testid="embedded-resources">
            <SettingTitle id="static-embeds">{t`Manage embeds`}</SettingTitle>
            <EmbeddedResources />
          </Box>
        )}
      </SettingsSection>
      <PLUGIN_CONTENT_TRANSLATION.ContentTranslationConfiguration />

      <RelatedSettingsSection items={getStaticEmbeddingRelatedSettingItems()} />
      <UpsellDevInstances location="embedding-page" />
    </SettingsPageWrapper>
  );
}
