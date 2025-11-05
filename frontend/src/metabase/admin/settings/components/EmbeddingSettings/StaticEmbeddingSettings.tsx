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
import { EmbeddingSettingsCard } from "./EmbeddingSettingsCard";

export function StaticEmbeddingSettings() {
  const isStaticEmbeddingEnabled = useSetting("enable-embedding-static");

  return (
    <SettingsPageWrapper title={t`Static embedding`}>
      <EmbeddingSettingsCard
        title={t`Enable static embedding`}
        description={t`A secure way to embed charts and dashboards when you don’t want to offer ad-hoc querying or chart drill-through.`}
        settingKey="enable-embedding-static"
      />

      <SettingsSection>
        <EmbeddingSecretKeyWidget />
      </SettingsSection>

      {isStaticEmbeddingEnabled && (
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

      <PLUGIN_CONTENT_TRANSLATION.ContentTranslationConfiguration />

      <RelatedSettingsSection items={getStaticEmbeddingRelatedSettingItems()} />
      <UpsellDevInstances location="embedding-page" />
    </SettingsPageWrapper>
  );
}
