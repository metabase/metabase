import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";

import { NewTransformFromQueryPage } from "./pages/NewTransformFromQueryPage";
import { NewTransformPage } from "./pages/NewTransformPage";
import { TransformListPage } from "./pages/TransformListPage";
import { TransformQueryPage } from "./pages/TransformQueryPage";

PLUGIN_TRANSFORMS.canAccessTransforms = getUserIsAdmin;
PLUGIN_TRANSFORMS.getTransformRoutes = () => (
  <>
    <Route path="transforms" component={TransformListPage} />
    <Route path="transforms/new" component={NewTransformPage} />
    <Route path="transforms/new/query" component={NewTransformFromQueryPage} />
    <Route path="transforms/:transformId" component={TransformListPage} />
    <Route
      path="transforms/:transformId/query"
      component={TransformQueryPage}
    />
  </>
);
