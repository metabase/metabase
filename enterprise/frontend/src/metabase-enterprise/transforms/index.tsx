import { IndexRoute } from "react-router";
import { t } from "ttag";

import { createAdminRouteGuard } from "metabase/admin/utils";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";

import { TransformPageLayout } from "./components/TransformPageLayout";
import { EmptyStatePage } from "./pages/EmptyStatePage";
import { NewTransformPage } from "./pages/NewTransformPage";
import { OverviewPage } from "./pages/OverviewPage";
import { TransformPage } from "./pages/TransformPage";

PLUGIN_TRANSFORMS.getAdminPaths = () => [
  { key: "transforms", name: t`Transforms`, path: "/admin/transforms" },
];

PLUGIN_TRANSFORMS.getAdminRoutes = () => (
  <Route path="transforms" component={createAdminRouteGuard("transforms")}>
    <Route title={t`Transforms`}>
      <Route component={TransformPageLayout}>
        <IndexRoute component={OverviewPage} />
        <Route path="new" component={EmptyStatePage} />
        <Route path=":transformId" component={TransformPage} />
      </Route>
      <Route path="new/:type" component={NewTransformPage} />
      <Route path="new/card/:cardId" component={NewTransformPage} />
    </Route>
  </Route>
);
