import { IndexRoute } from "react-router";
import { t } from "ttag";

import { createAdminRouteGuard } from "metabase/admin/utils";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";

import { NewTransformPage } from "./pages/NewTransformPage";
import { TransformOverviewPage } from "./pages/TransformOverviewPage";
import { TransformPageLayout } from "./pages/TransformPageLayout";

PLUGIN_TRANSFORMS.getAdminPaths = () => [
  { key: "transforms", name: t`Transforms`, path: "/admin/transforms" },
];

PLUGIN_TRANSFORMS.getAdminRoutes = () => (
  <Route path="transforms" component={createAdminRouteGuard("transforms")}>
    <Route title={t`Transforms`}>
      <Route component={TransformPageLayout}>
        <IndexRoute component={TransformOverviewPage} />
        <Route path="new" component={NewTransformPage} />
      </Route>
    </Route>
  </Route>
);
