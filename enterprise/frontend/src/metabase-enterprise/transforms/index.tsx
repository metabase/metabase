import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";

import { NewQueryTransformPage } from "./pages/NewQueryTransformPage";
import { TransformListPage } from "./pages/TransformListPage";
import { TransformQueryPage } from "./pages/TransformQueryPage";

PLUGIN_TRANSFORMS.canAccessTransforms = getUserIsAdmin;
PLUGIN_TRANSFORMS.getTransformRoutes = () => (
  <>
    <Route path="transforms" component={TransformListPage} />
    <Route path="transforms/new" component={NewQueryTransformPage} />
    <Route path="transforms/:transformId" component={TransformListPage} />
    <Route
      path="transforms/:transformId/query"
      component={TransformQueryPage}
    />
  </>
);
