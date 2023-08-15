import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { VerifiedSearchFilter } from "metabase-enterprise/content_verification/components/VerifiedSearchFilter/VerifiedSearchFilter";

if (hasPremiumFeature("content_verification")) {
  PLUGIN_CONTENT_VERIFICATION.VerifiedFilter = VerifiedSearchFilter;
}
