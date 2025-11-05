import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { UserProvisioning } from "./components/UserProvisioning";

if (hasPremiumFeature("scim")) {
  PLUGIN_AUTH_PROVIDERS.UserProvisioningSettings = UserProvisioning;
}
