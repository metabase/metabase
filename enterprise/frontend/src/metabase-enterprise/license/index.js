import { updateIn } from "icepick";
import { t } from "ttag";

import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";

import LicenseAndBillingSettings from "./components/LicenseAndBillingSettings";

PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections =>
  updateIn(sections, ["license"], license => {
    return {
      ...license,
      component: LicenseAndBillingSettings,
      name: t`License and Billing`,
      adminOnly: true,
    };
  }),
);
