import { IndexRoute } from "react-router";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";

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
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformRunPage } from "./pages/TransformRunPage";
import { TransformTargetPage } from "./pages/TransformTargetPage";
import { TransformsSidebarLayout } from "./pages/TransformsPageLayout/TransformsSidebarLayout";
import { TransformsTopNavLayout } from "./pages/TransformsPageLayout/TransformsTopNavLayout";

export function getBenchRoutes() {
  return (
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
          <Route path=":transformId" component={TransformQueryPage} />
          <Route path=":transformId/run" component={TransformRunPage} />
          <Route path=":transformId/target" component={TransformTargetPage} />
          {PLUGIN_DEPENDENCIES.isEnabled && (
            <Route
              path=":transformId/dependencies"
              component={TransformDependenciesPage}
            >
              <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
            </Route>
          )}
        </Route>
      </Route>
    </Route>
  );
}
