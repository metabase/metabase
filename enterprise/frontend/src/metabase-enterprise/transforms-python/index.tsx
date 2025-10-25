import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { Icon, Menu } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { trackTransformCreate } from "metabase-enterprise/transforms/analytics";

import { PythonTransformEditor } from "./components/PythonTransformEditor";
import { SourceSection } from "./components/SourceSection";
import { PythonRunnerSettingsPage } from "./pages/PythonRunnerSettingsPage";
import { getBenchNavItems, getBenchRoutes } from "./routes";

if (hasPremiumFeature("transforms-python")) {
  PLUGIN_TRANSFORMS_PYTHON.getBenchRoutes = getBenchRoutes;
  PLUGIN_TRANSFORMS_PYTHON.getBenchNavItems = getBenchNavItems;
  PLUGIN_TRANSFORMS_PYTHON.PythonRunnerSettingsPage = PythonRunnerSettingsPage;
  PLUGIN_TRANSFORMS_PYTHON.TransformEditor = PythonTransformEditor;
  PLUGIN_TRANSFORMS_PYTHON.SourceSection = SourceSection;

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
