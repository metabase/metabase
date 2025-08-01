import { IndexRoute } from "react-router";
import { t } from "ttag";

import { createAdminRouteGuard } from "metabase/admin/utils";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";

import { TransformPageLayout } from "./components/TransformPageLayout";
import { NewTransformPage } from "./pages/NewTransformPage";
import { NewTransformQueryPage } from "./pages/NewTransformQueryPage";
import { TransformOverviewPage } from "./pages/TransformOverviewPage";

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
      <Route path="new/:type" component={NewTransformQueryPage} />
      <Route path="new/card/:cardId" component={NewTransformQueryPage} />
    </Route>
  </Route>
);
