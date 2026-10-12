import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { pluginPlaceholderRoute } from "metabase/plugins/components/PluginPlaceholder";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

import { PythonTransformEditor } from "./components/PythonTransformEditor/lazy";
import { SHARED_LIB_IMPORT_PATH } from "./constants";
import { getPythonTransformsRoutes } from "./routes";
import { getPythonSourceValidationResult } from "./utils";

const pythonRunnerSettingsPage = () =>
  import(
    /* webpackChunkName: "python-runner-settings" */ "./pages/PythonRunnerSettingsPage"
  ).then(({ PythonRunnerSettingsPage }) => ({
    Component: PythonRunnerSettingsPage,
  }));

/**
 * Initialize transforms-python plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  PLUGIN_TRANSFORMS_PYTHON.getPythonTransformsRoutes =
    getPythonTransformsRoutes;
  PLUGIN_TRANSFORMS_PYTHON.pythonRunnerSettingsPage = featureGatedRoute(
    "transforms-python",
    pythonRunnerSettingsPage,
    pluginPlaceholderRoute,
  );

  if (hasPremiumFeature("transforms-python")) {
    PLUGIN_TRANSFORMS_PYTHON.isEnabled = true;
    PLUGIN_TRANSFORMS_PYTHON.getPythonSourceValidationResult =
      getPythonSourceValidationResult;
    PLUGIN_TRANSFORMS_PYTHON.TransformEditor = PythonTransformEditor;
  }

  PLUGIN_TRANSFORMS_PYTHON.sharedLibImportPath = SHARED_LIB_IMPORT_PATH;
}
