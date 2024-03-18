import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { VerifiedFilter } from "./VerifiedFilter";

if (hasPremiumFeature("content_verification")) {
  Object.assign(PLUGIN_CONTENT_VERIFICATION, {
    VerifiedFilter,
  });
}
