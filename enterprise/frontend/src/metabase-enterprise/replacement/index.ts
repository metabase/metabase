import { PLUGIN_REPLACEMENT } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SourceReplacementButton } from "./components/SourceReplacementButton";
import { SourceReplacementModal } from "./components/SourceReplacementModal";
import { SourceReplacementStatus } from "./components/SourceReplacementStatus";
import { TransformToolsMenu } from "./components/TransformToolsMenu";
import { getTransformToolsRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("dependencies")) {
    PLUGIN_REPLACEMENT.isEnabled = true;
    PLUGIN_REPLACEMENT.canReplaceSources = getUserIsAdmin;
    PLUGIN_REPLACEMENT.getTransformToolsRoutes = getTransformToolsRoutes;
    PLUGIN_REPLACEMENT.SourceReplacementButton = SourceReplacementButton;
    PLUGIN_REPLACEMENT.SourceReplacementModal = SourceReplacementModal;
    PLUGIN_REPLACEMENT.SourceReplacementStatus = SourceReplacementStatus;
    PLUGIN_REPLACEMENT.TransformToolsMenu = TransformToolsMenu;
  }
}
