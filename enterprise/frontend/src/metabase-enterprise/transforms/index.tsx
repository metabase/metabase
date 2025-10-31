import { IndexRoute } from "react-router";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";
import {
  PLUGIN_ENTITIES,
  PLUGIN_TRANSFORMS,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { Transforms } from "metabase-enterprise/entities/transforms";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TransformPicker } from "./components/TransformPicker";
import { JobListPage } from "./pages/JobListPage";
import { JobPage } from "./pages/JobPage";
import { NewJobPage } from "./pages/NewJobPage";
import {
  NewCardTransformPage,
  NewNativeTransformPage,
  NewPythonTransformPage,
  NewQueryTransformPage,
} from "./pages/NewTransformPage";
import { RunListPage } from "./pages/RunListPage";
import { TransformListPage } from "./pages/TransformListPage";
import { TransformPage } from "./pages/TransformPage";
import { DetailsPageLayout, ListPageLayout } from "./pages/TransformPageLayout";
import { TransformQueryPage } from "./pages/TransformQueryPage";

if (hasPremiumFeature("transforms")) {
  PLUGIN_ENTITIES.entities["transforms"] = Transforms;
  PLUGIN_TRANSFORMS.TransformPicker = TransformPicker;

  PLUGIN_TRANSFORMS.getBenchRoutes = () => (
    <Route path="transforms">
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
        {PLUGIN_TRANSFORMS_PYTHON.getAdminRoutes()}
        <Route path="new/query" component={NewQueryTransformPage} />
        <Route path="new/native" component={NewNativeTransformPage} />
        <Route path="new/card/:cardId" component={NewCardTransformPage} />
        {PLUGIN_TRANSFORMS_PYTHON.isEnabled && (
          <Route path="new/python" component={NewPythonTransformPage} />
        )}
        <Route path=":transformId/query" component={TransformQueryPage} />
      </Route>
    </Route>
  );
}
