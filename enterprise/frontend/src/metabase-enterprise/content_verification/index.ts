import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { VerifiedFilter } from "metabase-enterprise/content_verification/VerifiedFilter";

if (hasPremiumFeature("content_verification")) {
  PLUGIN_CONTENT_VERIFICATION.VerifiedFilter = VerifiedFilter;
}
