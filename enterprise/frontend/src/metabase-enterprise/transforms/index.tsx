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
import { JobEmptyPage } from "./pages/JobEmptyPage";
import { JobPage } from "./pages/JobPage";
import { NewJobPage } from "./pages/NewJobPage";
import {
  NewCardTransformPage,
  NewNativeTransformPage,
  NewPythonTransformPage,
  NewQueryTransformPage,
} from "./pages/NewTransformPage";
import { RunListPage } from "./pages/RunListPage";
import { TransformDependenciesPage } from "./pages/TransformDependenciesPage";
import { TransformEmptyPage } from "./pages/TransformEmptyPage";
import { TransformPage } from "./pages/TransformPage";
import { TransformRunPage } from "./pages/TransformRunPage";
import { TransformTargetPage } from "./pages/TransformTargetPage";
import { TransformsSidebarLayout } from "./pages/TransformsPageLayout/TransformsSidebarLayout";
import { TransformsTopNavLayout } from "./pages/TransformsPageLayout/TransformsTopNavLayout";

if (hasPremiumFeature("transforms")) {
  PLUGIN_ENTITIES.entities["transforms"] = Transforms;
  PLUGIN_TRANSFORMS.TransformPicker = TransformPicker;

  PLUGIN_TRANSFORMS.getBenchRoutes = () => (
    <Route path="transforms">
      <Route title={t`Transforms`}>
        <Route path="runs" component={TransformsTopNavLayout}>
          <IndexRoute component={RunListPage} />
        </Route>
        <Route component={TransformsSidebarLayout}>
          <IndexRoute component={TransformEmptyPage} />
          <Route path="jobs" component={JobEmptyPage} />
          <Route path="jobs/new" component={NewJobPage} />
          <Route path="jobs/:jobId" component={JobPage} />
          <Route path="new/query" component={NewQueryTransformPage} />
          <Route path="new/native" component={NewNativeTransformPage} />
          <Route path="new/card/:cardId" component={NewCardTransformPage} />
          {PLUGIN_TRANSFORMS_PYTHON.isEnabled && (
            <Route path="new/python" component={NewPythonTransformPage} />
          )}
          <Route path=":transformId" component={TransformPage} />
          <Route path=":transformId/run" component={TransformRunPage} />
          <Route path=":transformId/target" component={TransformTargetPage} />
          <Route
            path=":transformId/dependencies"
            component={TransformDependenciesPage}
          />
        </Route>
      </Route>
    </Route>
  );
}
