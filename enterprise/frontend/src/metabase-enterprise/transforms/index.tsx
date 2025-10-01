import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getTransformRoutes } from "./routes";
import { ROOT_URL } from "./urls";

if (hasPremiumFeature("transforms")) {
  PLUGIN_TRANSFORMS.ROOT_URL = ROOT_URL;
  PLUGIN_TRANSFORMS.getTransformRoutes = getTransformRoutes;
}
