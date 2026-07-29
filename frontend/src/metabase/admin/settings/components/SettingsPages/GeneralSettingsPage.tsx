import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { CollectUserDataInput } from "metabase/admin/settings/components/widgets/UsageTracking/CollectUserDataInput";
import { UpsellDevInstances } from "metabase/admin/upsells";
import { useAdminSetting } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_SEMANTIC_SEARCH } from "metabase/plugins";
import * as Urls from "metabase/urls";

import { DevInstanceBanner } from "../GeneralSettings/DevInstanceBanner";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { HomepageSetting } from "../widgets/HomepageSetting";
import { HttpsOnlyWidget } from "../widgets/HttpsOnlyWidget";
import { SiteUrlWidget } from "../widgets/SiteUrlWidget";
import { AnonymousTrackingInput } from "../widgets/UsageTracking/AnonymousTrackingInput";

export function GeneralSettingsPage() {
  const { url: iframeDocsUrl } = useDocsUrl("configuring-metabase/settings", {
    anchor: "allowed-domains-for-iframes-in-dashboards",
  });
  const { url: imgDocsUrl } = useDocsUrl("configuring-metabase/settings", {
    anchor: "allowed-domains-for-images",
  });
  const hasHostingFeature = useHasTokenFeature("hosting");
  const hasAuditAppFeature = useHasTokenFeature("audit_app");
  const customVizAvailable = useHasTokenFeature("custom-viz-available");
  const enableAnonymousTracking = !hasHostingFeature;
  const { value: cspImgEnabled } = useAdminSetting("csp-img-enabled");
  const { value: customVizEnabled } = useAdminSetting("custom-viz-enabled");

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
              {jt`You should make sure to trust the sources you allow your users to embed in dashboards. ${<ExternalLink key="docs" href={iframeDocsUrl}>{t`Learn more`}</ExternalLink>}`}
            </>
          }
          inputType="textarea"
        />

        <AdminSettingInput
          name="csp-img-enabled"
          title={t`Restrict image domains`}
          description={
            customVizEnabled
              ? jt`Required by Custom Visualizations. Turn off ${(
                  <Link key="custom-viz" to={Urls.customViz()} variant="brand">
                    {t`Custom Visualizations`}
                  </Link>
                )} before disabling this setting.`
              : customVizAvailable
                ? jt`Restrict the browser's Content Security Policy so images can only load from this Metabase instance or the domains you list below. Required to enable Custom Visualizations. ${<ExternalLink key="img-docs" href={imgDocsUrl}>{t`Learn more`}</ExternalLink>}`
                : t`Restrict the browser's Content Security Policy so images can only load from this Metabase instance or the domains you list below.`
          }
          inputType="boolean"
          disabled={Boolean(customVizEnabled)}
        />

        <AdminSettingInput
          name="csp-img-allowed-hosts"
          title={t`Allowed domains for images`}
          description={
            cspImgEnabled
              ? customVizAvailable
                ? jt`Domains that images can be loaded from in dashboard text, entity descriptions, and custom visualizations. Leave empty to only allow images hosted by this Metabase instance. ${<ExternalLink key="img-docs" href={imgDocsUrl}>{t`Learn more`}</ExternalLink>}`
                : jt`Domains that images can be loaded from in dashboard text and entity descriptions. Leave empty to only allow images hosted by this Metabase instance. ${<ExternalLink key="img-docs" href={imgDocsUrl}>{t`Learn more`}</ExternalLink>}`
              : t`Turn on the "Restrict image domains" setting above to enforce this allowlist.`
          }
          inputType="textarea"
          disabled={!cspImgEnabled}
        />
      </SettingsSection>

      {/* On starter plan, both conditions are `false` */}
      {(enableAnonymousTracking || hasAuditAppFeature) && (
        <SettingsSection title={t`Usage tracking`}>
          {enableAnonymousTracking && <AnonymousTrackingInput />}

          {hasAuditAppFeature && <CollectUserDataInput />}
        </SettingsSection>
      )}

      <UpsellDevInstances location="settings-general" />
    </SettingsPageWrapper>
  );
}
