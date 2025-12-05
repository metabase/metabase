import { IndexRoute, Route } from "react-router";

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
import { TransformSidebarLayout } from "./pages/TransformSidebarLayout";
import { TransformTargetPage } from "./pages/TransformTargetPage";
import { TransformTopNavLayout } from "./pages/TransformTopNavLayout";

export function getDataStudioTransformRoutes() {
  return (
    <>
      <Route path="runs" component={TransformTopNavLayout}>
        <IndexRoute component={RunListPage} />
      </Route>

      <Route component={TransformSidebarLayout}>
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
        {PLUGIN_TRANSFORMS_PYTHON.getPythonLibraryRoutes()}
      </Route>
    </>
  );
}
