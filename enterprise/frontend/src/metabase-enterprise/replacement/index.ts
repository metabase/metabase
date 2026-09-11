import { getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_REPLACEMENT, lazyPluginComponent } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SourceReplacementButton } from "./components/SourceReplacementButton";
import { getTransformToolsRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("dependencies")) {
    PLUGIN_REPLACEMENT.isEnabled = true;
    PLUGIN_REPLACEMENT.canReplaceSources = getUserIsAdmin;
    PLUGIN_REPLACEMENT.getTransformToolsRoutes = getTransformToolsRoutes;
    PLUGIN_REPLACEMENT.SourceReplacementButton = SourceReplacementButton;
    PLUGIN_REPLACEMENT.SourceReplacementModal = lazyPluginComponent(() =>
      import("./components/SourceReplacementModal").then(
        ({ SourceReplacementModal }) => SourceReplacementModal,
      ),
    );
    PLUGIN_REPLACEMENT.SourceReplacementStatus = lazyPluginComponent(() =>
      import("./components/SourceReplacementStatus").then(
        ({ SourceReplacementStatus }) => SourceReplacementStatus,
      ),
    );
    PLUGIN_REPLACEMENT.TransformToolsMenu = lazyPluginComponent(() =>
      import("./components/TransformToolsMenu").then(
        ({ TransformToolsMenu }) => TransformToolsMenu,
      ),
    );
  }
}
