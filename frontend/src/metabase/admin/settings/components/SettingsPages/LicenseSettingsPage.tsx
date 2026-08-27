import { PLUGIN_ADMIN_SETTINGS, PLUGIN_IS_EE_BUILD } from "metabase/plugins";

import { SettingsLicense } from "../SettingsLicense";

export function LicenseSettingsPage() {
  if (PLUGIN_IS_EE_BUILD.isEEBuild()) {
    return <PLUGIN_ADMIN_SETTINGS.LicenseAndBillingSettings />;
  }

  return <SettingsLicense />;
}
