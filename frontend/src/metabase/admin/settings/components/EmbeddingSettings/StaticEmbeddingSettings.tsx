import { t } from "ttag";

import { UpsellDevInstances } from "metabase/admin/upsells/UpsellDevInstances";
import { useSetting } from "metabase/common/hooks";
import { Box } from "metabase/ui";

import { SettingTitle } from "../SettingHeader";
import { SettingsPageWrapper, SettingsSection } from "../SettingsSection";
import { EmbeddedResources } from "../widgets/PublicLinksListing/EmbeddedResources";

import { EmbeddingSecretKeyWidget } from "./EmbeddingSecretKeyWidget";
import { EmbeddingToggle } from "./EmbeddingToggle";

export function StaticEmbeddingSettings() {
  const isStaticEmbeddingEnabled = useSetting("enable-embedding-static");

  return (
    <SettingsPageWrapper title={t`Static embedding`}>
      <UpsellDevInstances source="embedding-page" />
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
    </SettingsPageWrapper>
  );
}
