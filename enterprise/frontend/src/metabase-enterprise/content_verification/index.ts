import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("content_verification")) {
  PLUGIN_CONTENT_VERIFICATION.isEnabled = () => true;
}
