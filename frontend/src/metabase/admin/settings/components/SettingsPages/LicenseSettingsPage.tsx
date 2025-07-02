import { isEEBuild } from "metabase/lib/ee-utils";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

import { SettingsLicense } from "../SettingsLicense";

export function LicenseSettingsPage() {
  if (isEEBuild()) {
    return <PLUGIN_ADMIN_SETTINGS.LicenseAndBillingSettings />;
  }

  return <SettingsLicense />;
}
