import { t } from "ttag";

import {
  PLUGIN_ADMIN_SETTINGS_AUTH_TABS,
  PLUGIN_ADMIN_SETTINGS_UPDATES,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { UserProvisioning } from "./components/UserProvisioning";

// TODO: get real premium feature
// eslint-disable-next-line no-constant-condition
if (true || hasPremiumFeature("")) {
  PLUGIN_ADMIN_SETTINGS_AUTH_TABS.splice(1, 0, {
    name: t`User Provisioning`,
    key: "user-provisioning",
    to: "/admin/settings/authentication/user-provisioning",
  });

  PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections => ({
    ...sections,
    "authentication/user-provisioning": {
      settings: [],
      component: UserProvisioning,
    },
  }));
}
