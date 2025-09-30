import { IndexRoute } from "react-router";
import { t } from "ttag";

import { createAdminRouteGuard } from "metabase/admin/utils";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS, PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { JobListPage } from "./pages/JobListPage";
import { JobPage } from "./pages/JobPage";
import { NewJobPage } from "./pages/NewJobPage";
import { NewTransformPage } from "./pages/NewTransformPage";
import { RunListPage } from "./pages/RunListPage";
import { TransformPage } from "./pages/TransformPage";
import { DetailsPageLayout, ListPageLayout, TransformPageLayout } from "./pages/TransformPageLayout";
import { TransformQueryPage } from "./pages/TransformQueryPage";

if (hasPremiumFeature("transforms")) {
  PLUGIN_TRANSFORMS.getAdminPaths = () => [
    { key: "transforms", name: t`Transforms`, path: "/admin/transforms" },
  ];

  PLUGIN_TRANSFORMS.getAdminRoutes = () => (
    <>
      <Route component={ListPageLayout}>
        <Route path="jobs" component={JobListPage} />
        <Route path="runs" component={RunListPage} />
      </Route>
      <Route component={DetailsPageLayout}>
        <Route path="jobs/new" component={NewJobPage} />
        <Route path="jobs/:jobId" component={JobPage} />
      </Route>
      <Route path="transforms" component={createAdminRouteGuard("transforms")}>
        <Route title={t`Transforms`} component={TransformPageLayout}>
          <IndexRoute component={() => <div>pick a transform</div>} />
          <Route path=":transformId" component={TransformPage} />
          <Route path="new/:type" component={NewTransformPage} />
          <Route path="new/card/:cardId" component={NewTransformPage} />
          <Route path=":transformId/query" component={TransformQueryPage} />
        </Route>
      </Route>
      {PLUGIN_TRANSFORMS_PYTHON.getAdminRoutes()}
    </>
  );
}
