import { t } from "ttag";

import {
  RelatedSettingsSection,
  getInteractiveEmbeddingRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { EmbeddingSettingsCard } from "metabase/admin/settings/components/EmbeddingSettings";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { UpsellDevInstances } from "metabase/admin/upsells";
import { useDocsUrl } from "metabase/common/hooks";

import { EmbeddingAppOriginDescription } from "./EmbeddingAppOriginDescription";

const utmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: "embedding-interactive",
  utm_content: "embedding-interactive-admin",
};

export function InteractiveEmbeddingSettings() {
  const { url: quickStartUrl } = useDocsUrl(
    "embedding/interactive-embedding-quick-start-guide",
    {
      utm: utmTags,
    },
  );

  return (
    <SettingsPageWrapper title={t`Interactive embedding`}>
      <EmbeddingSettingsCard
        title={t`Enable interactive embedding`}
        description={t`Embed the full power of Metabase into your application to build a custom analytics experience and programmatically manage dashboards and data.`}
        settingKey="enable-embedding-interactive"
        links={[{ icon: "bolt", title: t`Quick start`, href: quickStartUrl }]}
      />

      <SettingsSection>
        <AdminSettingInput
          name="embedding-app-origins-interactive"
          title={t`Authorized origins`}
          titleProps={{ fz: "lg", mb: "xs" }}
          description={<EmbeddingAppOriginDescription />}
          placeholder="https://*.example.com"
          inputType="text"
        />
      </SettingsSection>

      <RelatedSettingsSection
        items={getInteractiveEmbeddingRelatedSettingItems()}
      />

      <UpsellDevInstances location="embedding-page" />
    </SettingsPageWrapper>
  );
}
