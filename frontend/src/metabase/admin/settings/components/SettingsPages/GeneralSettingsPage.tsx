import { jt, t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { PLUGIN_LANDING_PAGE } from "metabase/plugins";
import { Stack, Title } from "metabase/ui";

import { SettingSection } from "../SettingsSection";
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
    <Stack gap="lg" maw="42rem">
      <Title order={1}>
        {t`General`}
      </Title>
      <SettingSection>
        <AdminSettingInput
          name="site-name"
          title={t`Site Name`}
          inputType="text"
        />

        <SiteUrlWidget />

        <HttpsOnlyWidget />

        <CustomHomepageDashboardSetting />

        <PLUGIN_LANDING_PAGE.LandingPageWidget />
      </SettingSection>

      <SettingSection>
        <AdminSettingInput
          name="admin-email"
          title={t`Email Address for Help Requests`}
          inputType="text"
        />

        <AnonymousTrackingInput />
      </SettingSection>

      <SettingSection>
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
      </SettingSection>


      <SettingSection>
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
      </SettingSection>
    </Stack>
  );
}
