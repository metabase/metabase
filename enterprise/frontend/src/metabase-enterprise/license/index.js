import { t } from "ttag";
import { updateIn } from "icepick";
import {
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_SELECTORS,
} from "metabase/plugins";
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

PLUGIN_SELECTORS.getIsEECode = () => true;
