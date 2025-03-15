import { jt, t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
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

  return (
    <Stack gap="xl" maw="42rem" px="lg" py="sm">
      <AdminSettingInput
        name="site-name"
        title={t`Site Name`}
        description={t`The name used for this instance of Metabase.`}
        inputType="text"
      />

      <SiteUrlWidget />

      <HttpsOnlyWidget />

      <CustomHomepageDashboardSetting />

      <PLUGIN_LANDING_PAGE.LandingPageWidget />

      <AdminSettingInput
        name="admin-email"
        title={t`Email Address for Help Requests`}
        description={t`The email address users should be referred to if they encounter a problem.`}
        inputType="text"
      />

      <AnonymousTrackingInput />

      <AdminSettingInput
        name="humanization-strategy"
        title={t`Friendly Table and Field Names`}
        description={t`To make table and field names more human-friendly, Metabase will replace dashes and underscores in them with spaces. We’ll capitalize each word while at it, so ‘last_visited_at’ will become ‘Last Visited At’.`}
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
        description={t`Allow users to explore data using X-rays`}
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
