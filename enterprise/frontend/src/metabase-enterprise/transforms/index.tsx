import { IndexRoute } from "react-router";
import { t } from "ttag";

import { createAdminRouteGuard } from "metabase/admin/utils";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { JobListPage } from "./pages/JobListPage";
import { JobPage } from "./pages/JobPage";
import { NewJobPage } from "./pages/NewJobPage";
import { NewTransformQueryPage } from "./pages/NewTransformQueryPage";
import { RunListPage } from "./pages/RunListPage";
import { TransformListPage } from "./pages/TransformListPage";
import { TransformPage } from "./pages/TransformPage";
import { DetailsPageLayout, ListPageLayout } from "./pages/TransformPageLayout";
import { TransformQueryPage } from "./pages/TransformQueryPage";

if (hasPremiumFeature("transforms")) {
  PLUGIN_TRANSFORMS.getAdminPaths = () => [
    { key: "transforms", name: t`Transforms`, path: "/admin/transforms" },
  ];

  PLUGIN_TRANSFORMS.getAdminRoutes = () => (
    <Route path="transforms" component={createAdminRouteGuard("transforms")}>
      <Route title={t`Transforms`}>
        <Route component={ListPageLayout}>
          <IndexRoute component={TransformListPage} />
          <Route path="jobs" component={JobListPage} />
          <Route path="runs" component={RunListPage} />
        </Route>
        <Route component={DetailsPageLayout}>
          <Route path="jobs/new" component={NewJobPage} />
          <Route path="jobs/:jobId" component={JobPage} />
          <Route path=":transformId" component={TransformPage} />
        </Route>
        <Route path="new/:type" component={NewTransformQueryPage} />
        <Route path="new/card/:cardId" component={NewTransformQueryPage} />
        <Route path=":transformId/query" component={TransformQueryPage} />
      </Route>
    </Route>
  );
}
