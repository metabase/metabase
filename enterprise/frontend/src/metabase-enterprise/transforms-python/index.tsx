import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { PythonTransformEditor } from "./components/PythonTransformEditor";
import { PythonRunnerSettingsPage } from "./pages/PythonRunnerSettingsPage";
import { getPythonLibraryRoutes } from "./routes";

if (hasPremiumFeature("transforms-python")) {
  PLUGIN_TRANSFORMS_PYTHON.isEnabled = true;
  PLUGIN_TRANSFORMS_PYTHON.getPythonLibraryRoutes = getPythonLibraryRoutes;
  PLUGIN_TRANSFORMS_PYTHON.TransformEditor = PythonTransformEditor;
  PLUGIN_TRANSFORMS_PYTHON.PythonRunnerSettingsPage = PythonRunnerSettingsPage;
}
