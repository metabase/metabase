import { PLUGIN_SEMANTIC_LAYER } from "metabase/plugins";
// import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SemanticLayerSection } from "./components/SemanticLayerSection";
import { isSemanticLayerCollectionType } from "./utils";

// if (hasPremiumFeature("semantic_layer")) {
PLUGIN_SEMANTIC_LAYER.isEnabled = true;
PLUGIN_SEMANTIC_LAYER.isSemanticLayerCollectionType =
  isSemanticLayerCollectionType;
PLUGIN_SEMANTIC_LAYER.SemanticLayerSection = SemanticLayerSection;
// }
