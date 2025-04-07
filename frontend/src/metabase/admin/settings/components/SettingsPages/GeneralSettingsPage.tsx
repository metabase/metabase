import { jt, t } from "ttag";

import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { PLUGIN_LANDING_PAGE } from "metabase/plugins";
import { Stack } from "metabase/ui";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { AnonymousTrackingInput } from "../widgets/AnonymousTrackingInput";
import { CustomHomepageDashboardSetting } from "../widgets/CustomHomepageDashboardSetting";
import { HttpsOnlyWidget } from "../widgets/HttpsOnlyWidget";
import { SiteUrlWidget } from "../widgets/SiteUrlWidget";

export function GeneralSettingsPage() {
  const { url: iframeDocsUrl } = useDocsUrl("configuring-metabase/settings", {
    anchor: "allowed-domains-for-iframes-in-dashboards",
  });

  const hasQueryValidation = useHasTokenFeature("query_reference_validation");

  return (
    <Stack gap="xl" maw="42rem" px="lg" py="sm">
      <AdminSettingInput
        name="site-name"
        title={t`Site Name`}
        inputType="text"
      />

      <SiteUrlWidget />

      <HttpsOnlyWidget />

      <CustomHomepageDashboardSetting />

      <PLUGIN_LANDING_PAGE.LandingPageWidget />

      <AdminSettingInput
        name="admin-email"
        title={t`Email Address for Help Requests`}
        inputType="text"
      />

      <AnonymousTrackingInput />

      <AdminSettingInput
        name="humanization-strategy"
        title={t`Friendly Table and Field Names`}
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
        title={t`Enable X-Ray Features`}
        inputType="boolean"
      />

      <AdminSettingInput
        hidden={!hasQueryValidation}
        name="query-analysis-enabled"
        title={t`Enable query analysis`}
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
    </Stack>
  );
}
