import { IndexRoute } from "react-router";
import { t } from "ttag";

import { createAdminRouteGuard } from "metabase/admin/utils";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";

import { TransformOverviewPage } from "./pages/TransformOverviewPage";

PLUGIN_TRANSFORMS.getAdminPaths = () => [
  { key: "transforms", name: t`Transforms`, path: "/admin/transforms" },
];

PLUGIN_TRANSFORMS.getAdminRoutes = () => (
  <Route path="transforms" component={createAdminRouteGuard("transforms")}>
    <Route title={t`Transforms`}>
      <IndexRoute component={TransformOverviewPage} />
    </Route>
  </Route>
);
