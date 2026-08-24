import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { CollectUserDataInput } from "metabase/admin/settings/components/widgets/UsageTracking/CollectUserDataInput";
import { UpsellDevInstances } from "metabase/admin/upsells";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_EMBEDDING_SDK, PLUGIN_SEMANTIC_SEARCH } from "metabase/plugins";
import { useAdminSetting, useSetting } from "metabase/settings";
import { Group, Icon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DevInstanceBanner } from "../GeneralSettings/DevInstanceBanner";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { HomepageSetting } from "../widgets/HomepageSetting";
import { HttpsOnlyWidget } from "../widgets/HttpsOnlyWidget";
import { SiteUrlWidget } from "../widgets/SiteUrlWidget";
import { AnonymousTrackingInput } from "../widgets/UsageTracking/AnonymousTrackingInput";

export function GeneralSettingsPage() {
  const hasHostingFeature = useHasTokenFeature("hosting");
  const hasAuditAppFeature = useHasTokenFeature("audit_app");
  const enableAnonymousTracking = !hasHostingFeature;
  const { value: cspImgEnabled } = useAdminSetting("csp-img-enabled");
  const { value: customVizEnabled } = useAdminSetting("custom-viz-enabled");
  const isReactSdkFeatureAvailable = PLUGIN_EMBEDDING_SDK.isEnabled();
  const hasSimpleEmbeddingFeature = useHasTokenFeature("embedding_simple");
  const isHosted = useSetting("is-hosted?");

  return (
    <SettingsPageWrapper title={t`General`}>
      <DevInstanceBanner />

      <SettingsSection title={t`App config`}>
        <AdminSettingInput
          name="site-name"
          title={t`Site name`}
          inputType="text"
        />

        <SiteUrlWidget />

        <HttpsOnlyWidget />

        <PLUGIN_SEMANTIC_SEARCH.SearchSettingsWidget />

        <HomepageSetting />
      </SettingsSection>

      <SettingsSection title={t`Email`}>
        <AdminSettingInput
          name="admin-email"
          title={t`Email address for help requests`}
          inputType="text"
        />
      </SettingsSection>

      <SettingsSection title={t`Tables and X-Rays`}>
        <AdminSettingInput
          name="humanization-strategy"
          title={t`Friendly table and field names`}
          options={[
            {
              value: "simple",
              label: t`Replace underscores and dashes with spaces`,
            },
            { value: "none", label: t`Disabled` },
          ]}
          inputType="select"
        />

        <AdminSettingInput
          name="enable-xrays"
          title={t`Enable X-Ray features`}
          inputType="boolean"
        />
      </SettingsSection>

      {/* On starter plan, both conditions are `false` */}
      {(enableAnonymousTracking || hasAuditAppFeature) && (
        <SettingsSection title={t`Usage tracking`}>
          {enableAnonymousTracking && <AnonymousTrackingInput />}

          {hasAuditAppFeature && <CollectUserDataInput />}
        </SettingsSection>
      )}

      {isReactSdkFeatureAvailable && hasSimpleEmbeddingFeature && isHosted && (
        <SettingsSection title={t`Version pinning`}>
          <Text c="text-secondary" lh="lg" mb="sm">
            {t`Metabase Cloud instances are automatically upgraded to new releases. SDK packages are strictly compatible with specific version of Metabase. You can request to pin your Metabase to a major version and upgrade your Metabase and SDK dependency in a coordinated fashion.`}
          </Text>

          <ExternalLink href="mailto:help@metabase.com">
            <Group gap="sm" fw="bold" w="fit-content">
              <Icon name="mail" size={14} aria-hidden />
              <span>{t`Request version pinning`}</span>
            </Group>
          </ExternalLink>
        </SettingsSection>
      )}

      <UpsellDevInstances location="settings-general" />
    </SettingsPageWrapper>
  );
}
