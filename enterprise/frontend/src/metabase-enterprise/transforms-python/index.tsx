import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Route } from "metabase/hoc/Title";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { Icon, Menu } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { trackTransformCreate } from "metabase-enterprise/transforms/analytics";
import { FullWidthTransformPageLayout } from "metabase-enterprise/transforms/pages/TransformPageLayout";

import { PythonTransformEditor } from "./components/PythonTransformEditor";
import { SourceSection } from "./components/SourceSection";
import { SHARED_LIB_IMPORT_PATH } from "./constants";
import { PythonLibraryEditorPage } from "./pages/PythonLibraryEditorPage";
import { PythonRunnerSettingsPage } from "./pages/PythonRunnerSettingsPage";

if (hasPremiumFeature("transforms-python")) {
  PLUGIN_TRANSFORMS_PYTHON.PythonRunnerSettingsPage = PythonRunnerSettingsPage;
  PLUGIN_TRANSFORMS_PYTHON.TransformEditor = PythonTransformEditor;
  PLUGIN_TRANSFORMS_PYTHON.SourceSection = SourceSection;

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

  PLUGIN_TRANSFORMS_PYTHON.getCreateTransformsMenuItems = () => (
    <Menu.Item
      component={ForwardRefLink}
      to={Urls.newTransformFromType("python")}
      leftSection={<Icon name="code_block" />}
      onClick={() => {
        trackTransformCreate({
          triggeredFrom: "transform-page-create-menu",
          creationType: "python",
        });
      }}
    >
      {t`Python script`}
    </Menu.Item>
  );
}
