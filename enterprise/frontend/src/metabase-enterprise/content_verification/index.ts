import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { VerifiedFilter } from "./VerifiedFilter";
import { MetricFilterControls, getDefaultMetricFilters } from "./metrics";
import { ModelFilterControls, getDefaultModelFilters } from "./models";

if (hasPremiumFeature("content_verification")) {
  Object.assign(PLUGIN_CONTENT_VERIFICATION, {
    contentVerificationEnabled: true,
    VerifiedFilter,

    ModelFilterControls,
    getDefaultModelFilters,

    getDefaultMetricFilters,
    MetricFilterControls,
  });
}
