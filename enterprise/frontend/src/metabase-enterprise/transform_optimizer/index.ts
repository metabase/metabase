import { PLUGIN_TRANSFORM_OPTIMIZER } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { FindSlowTool } from "./components/FindSlowTool";
import { TransformOptimizerSection } from "./components/TransformOptimizerSection";

export function initializePlugin() {
  // The optimizer rides on the same premium gate as the existing
  // transform-inspector feature, since both share enterprise context-builder
  // and Metabot tool infrastructure.
  if (hasPremiumFeature("transforms-python")) {
    PLUGIN_TRANSFORM_OPTIMIZER.isEnabled = true;
    PLUGIN_TRANSFORM_OPTIMIZER.RunPageSection = TransformOptimizerSection;
    PLUGIN_TRANSFORM_OPTIMIZER.FindSlowTool = FindSlowTool;
  }
}
