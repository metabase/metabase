import { hasPremiumFeature } from "metabase-enterprise/settings";
import {
  enabledApplicationNameReplacement,
  updateColors,
} from "metabase-enterprise/whitelabel/lib/whitelabel";

if (hasPremiumFeature("whitelabel")) {
  updateColors();
  enabledApplicationNameReplacement();
}
