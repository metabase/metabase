import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ModelFilterControls } from "./ModelFilterControls";
import { VerifiedFilter } from "./VerifiedFilter";
import { availableModelFilters, useModelFilterSettings } from "./utils";

if (hasPremiumFeature("content_verification")) {
  Object.assign(PLUGIN_CONTENT_VERIFICATION, {
    VerifiedFilter,
    ModelFilterControls,
    availableModelFilters,
    useModelFilterSettings,
  });
}
