import { t } from "ttag";

import { EmbeddingToggle } from "metabase/admin/settings/components/EmbeddingSettings/EmbeddingToggle";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/settings/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useDocsUrl } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, Button } from "metabase/ui";

import { EmbeddingAppOriginDescription } from "./EmbeddingAppOriginDescription";
import { SameSiteSelectWidget } from "./EmbeddingAppSameSiteCookieDescription";

const utmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: "embedding-interactive",
  utm_content: "embedding-interactive-admin",
};

export function InteractiveEmbeddingSettings() {
  // eslint-disable-next-line no-unconditional-metabase-links-render -- This is used in admin settings
  const { url: quickStartUrl } = useDocsUrl(
    "embedding/interactive-embedding-quick-start-guide",
    {
      utm: utmTags,
    },
  );

  return (
    <SettingsPageWrapper title={t`Interactive embedding`}>
      <SettingsSection>
        <EmbeddingToggle
          settingKey="enable-embedding-interactive"
          label={t`Enable interactive embedding`}
        />

        <Box>
          <SettingHeader id="get-started" title={t`Get started`} />
          <Button
            mt="xs"
            variant="outline"
            component={ExternalLink}
            href={quickStartUrl}
          >{t`Check out the Quickstart`}</Button>
        </Box>

        <AdminSettingInput
          name="embedding-app-origins-interactive"
          title={t`Authorized origins`}
          description={<EmbeddingAppOriginDescription />}
          placeholder="https://*.example.com"
          inputType="text"
        />

        <SameSiteSelectWidget />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
