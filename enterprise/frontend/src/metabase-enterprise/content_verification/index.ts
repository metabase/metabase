import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { VerifiedFilter } from "./VerifiedFilter";
import { BrowseFilterControls } from "./BrowseFilterControls";
import {
  browseFilters,
  sortCollectionsForBrowseModels,
  sortModelsByVerification,
} from "./utils";

if (hasPremiumFeature("content_verification")) {
  Object.assign(PLUGIN_CONTENT_VERIFICATION, {
    VerifiedFilter,
    BrowseFilterControls,
    browseFilters,
    sortCollectionsForBrowseModels,
    sortModelsByVerification,
  });
}
