import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";

import { NewTransformPage } from "./pages/NewTransformPage";
import { NewTransformQueryPage } from "./pages/NewTransformQueryPage";
import { TransformPage } from "./pages/TransformPage";
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformSettingsPage } from "./pages/TransformSettingsPage";

PLUGIN_TRANSFORMS.canAccessTransforms = getUserIsAdmin;

PLUGIN_TRANSFORMS.getRoutesWithSidebar = () => (
  <>
    <Route path="transforms" component={NewTransformPage} />
    <Route path="transforms/settings" component={TransformSettingsPage} />
    <Route path="transforms/:transformId" component={TransformPage} />
  </>
);

PLUGIN_TRANSFORMS.getRoutesWithoutSidebar = () => (
  <>
    <Route path="transforms/new/:type" component={NewTransformQueryPage} />
    <Route
      path="transforms/new/card/:cardId"
      component={NewTransformQueryPage}
    />
    <Route
      path="transforms/:transformId/query"
      component={TransformQueryPage}
    />
  </>
);
