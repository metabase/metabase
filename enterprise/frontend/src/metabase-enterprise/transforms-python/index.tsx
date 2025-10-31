import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { Route } from "metabase/hoc/Title";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { FullWidthTransformPageLayout } from "metabase-enterprise/transforms/pages/TransformPageLayout";

import { PythonTransformEditor } from "./components/PythonTransformEditor";
import { SHARED_LIB_IMPORT_PATH } from "./constants";
import { PythonLibraryEditorPage } from "./pages/PythonLibraryEditorPage";
import { PythonRunnerSettingsPage } from "./pages/PythonRunnerSettingsPage";

if (hasPremiumFeature("transforms-python")) {
  PLUGIN_TRANSFORMS_PYTHON.isEnabled = true;
  PLUGIN_TRANSFORMS_PYTHON.PythonRunnerSettingsPage = PythonRunnerSettingsPage;
  PLUGIN_TRANSFORMS_PYTHON.TransformEditor = PythonTransformEditor;

  PLUGIN_TRANSFORMS_PYTHON.getAdminRoutes = () => (
    <Route component={FullWidthTransformPageLayout}>
      <Route path="library/:path" component={PythonLibraryEditorPage} />
    </Route>
  );

  PLUGIN_TRANSFORMS_PYTHON.getTransformsNavLinks = () => (
    <AdminNavItem
      label={t`Python library`}
      path={Urls.transformPythonLibrary({ path: SHARED_LIB_IMPORT_PATH })}
      icon="code_block"
    />
  );
}
