import { isEEBuild } from "metabase/lib/utils";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

import { SettingsLicense } from "../SettingsLicense";

export function LicenseSettingsPage() {
  if (isEEBuild()) {
    return <PLUGIN_ADMIN_SETTINGS.LicenseAndBillingSettings />;
  }

  return <SettingsLicense />;
}
