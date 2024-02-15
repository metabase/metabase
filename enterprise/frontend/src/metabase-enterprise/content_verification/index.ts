import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { VerifiedFilter } from "./VerifiedFilter";
import { ModelFilterControls } from "./ModelFilterControls";
import {
  availableModelFilters,
  sortCollectionsByVerification,
  sortModelsByVerification,
} from "./utils";

if (hasPremiumFeature("content_verification")) {
  Object.assign(PLUGIN_CONTENT_VERIFICATION, {
    VerifiedFilter,
    ModelFilterControls,
    availableModelFilters,
    sortModelsByVerification,
    sortCollectionsByVerification,
  });
}
