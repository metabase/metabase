import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { UpsellDevInstances } from "metabase/admin/upsells";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_LANDING_PAGE, PLUGIN_SEMANTIC_SEARCH } from "metabase/plugins";

import { DevInstanceBanner } from "../GeneralSettings/DevInstanceBanner";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { AnonymousTrackingInput } from "../widgets/AnonymousTrackingInput";
import { CustomHomepageDashboardSetting } from "../widgets/CustomHomepageDashboardSetting";
import { HttpsOnlyWidget } from "../widgets/HttpsOnlyWidget";
import { SiteUrlWidget } from "../widgets/SiteUrlWidget";

export function GeneralSettingsPage() {
  const { url: iframeDocsUrl } = useDocsUrl("configuring-metabase/settings", {
    anchor: "allowed-domains-for-iframes-in-dashboards",
  });
  const hasHostingFeature = useHasTokenFeature("hosting");
  const enableAnonymousTracking = !hasHostingFeature;

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

        <CustomHomepageDashboardSetting />

        <PLUGIN_LANDING_PAGE.LandingPageWidget />
      </SettingsSection>

      <SettingsSection
        title={enableAnonymousTracking ? t`Email and tracking` : t`Email`}
      >
        <AdminSettingInput
          name="admin-email"
          title={t`Email address for help requests`}
          inputType="text"
        />

        {enableAnonymousTracking && <AnonymousTrackingInput />}
      </SettingsSection>

      <SettingsSection title={t`Tables, X-Rays and domains`}>
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

        <AdminSettingInput
          name="allowed-iframe-hosts"
          title={t`Allowed domains for iframes in dashboards`}
          description={
            <>
              {jt`You should make sure to trust the sources you allow your users to embed in dashboards. ${(<ExternalLink key="docs" href={iframeDocsUrl}>{t`Learn more`}</ExternalLink>)}`}
            </>
          }
          inputType="textarea"
        />
      </SettingsSection>
      <UpsellDevInstances location="settings-general" />
    </SettingsPageWrapper>
  );
}
