import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellDataApps } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_DATA_APPS } from "metabase/plugins";

/**
 * Admin page at /admin/settings/data-apps. Lives in OSS so the nav item + upsell
 * show on every edition; the real management UI is provided by the enterprise
 * plugin (`PLUGIN_DATA_APPS.ManageDataAppsPage`) and only rendered once the
 * `data-apps` token feature is present.
 */
export function DataAppsManagePage() {
  const hasDataApps = useHasTokenFeature("data-apps");

  if (!hasDataApps) {
    return (
      <SettingsPageWrapper title={t`Data apps`}>
        <UpsellDataApps location="settings-data-apps" />
      </SettingsPageWrapper>
    );
  }

  return <PLUGIN_DATA_APPS.ManageDataAppsPage />;
}
