import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

import { LicenseAndBillingSettings } from "./components/LicenseAndBillingSettings";
import { useUpsellFlow } from "./use-upsell-flow";

export function initializePlugin() {
  PLUGIN_ADMIN_SETTINGS.LicenseAndBillingSettings = LicenseAndBillingSettings;
  PLUGIN_ADMIN_SETTINGS.useUpsellFlow = useUpsellFlow;
}
