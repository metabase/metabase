import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { VerifiedFilter } from "metabase-enterprise/content_verification/VerifiedFilter";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("content_verification")) {
  PLUGIN_CONTENT_VERIFICATION.VerifiedFilter = VerifiedFilter;
}
