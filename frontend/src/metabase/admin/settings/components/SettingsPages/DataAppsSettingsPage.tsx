import { t } from "ttag";

import { UpsellDataApps } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_DATA_APPS } from "metabase/plugins";
import { SettingsPageWrapper } from "metabase/settings-components";

/**
 * Admin page at /admin/settings/apps. Shows the upsell on instances without the
 * `data-apps` token feature; the enterprise plugin provides the management UI.
 */
export function DataAppsManagePage() {
  const hasDataApps = useHasTokenFeature("data-apps");

  if (!hasDataApps) {
    return (
      <SettingsPageWrapper title={t`Data apps`}>
        <UpsellDataApps source="settings-data-apps" />
      </SettingsPageWrapper>
    );
  }

  return <PLUGIN_DATA_APPS.ManageDataAppsPage />;
}

export function DataAppUsersManagePage() {
  return <PLUGIN_DATA_APPS.ManageDataAppUsersPage />;
}
