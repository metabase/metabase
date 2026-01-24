import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { PythonTransformEditor } from "./components/PythonTransformEditor";
import { SHARED_LIB_IMPORT_PATH } from "./constants";
import { PythonRunnerSettingsPage } from "./pages/PythonRunnerSettingsPage";
import { getPythonLibraryRoutes } from "./routes";
import { getPythonSourceValidationResult } from "./utils";

/**
 * Initialize transforms-python plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("transforms-python")) {
    PLUGIN_TRANSFORMS_PYTHON.isEnabled = true;
    PLUGIN_TRANSFORMS_PYTHON.getPythonLibraryRoutes = getPythonLibraryRoutes;
    PLUGIN_TRANSFORMS_PYTHON.getPythonSourceValidationResult =
      getPythonSourceValidationResult;
    PLUGIN_TRANSFORMS_PYTHON.TransformEditor = PythonTransformEditor;
    PLUGIN_TRANSFORMS_PYTHON.PythonRunnerSettingsPage =
      PythonRunnerSettingsPage;
    PLUGIN_TRANSFORMS_PYTHON.sharedLibImportPath = SHARED_LIB_IMPORT_PATH;
  }
}
