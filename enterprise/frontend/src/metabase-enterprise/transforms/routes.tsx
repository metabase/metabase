import { IndexRoute, Route } from "react-router";

import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";

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
import { TransformDependenciesPage } from "./pages/TransformDependenciesPage";
import { TransformInspectPage } from "./pages/TransformInspectPage";
import { TransformInspectPageMock } from "./pages/TransformInspectPage/TransformInspectPageMock";
import { TransformInspectV2Page } from "./pages/TransformInspectV2Page";
import { TransformListPage } from "./pages/TransformListPage";
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformRunPage } from "./pages/TransformRunPage";
import { TransformSettingsPage } from "./pages/TransformSettingsPage";
import { TransformTopNavLayout } from "./pages/TransformTopNavLayout";

export function getDataStudioTransformRoutes() {
  return (
    <>
      <Route path="runs" component={TransformTopNavLayout}>
        <IndexRoute component={RunListPage} />
      </Route>
      <Route>
        <IndexRoute component={TransformListPage} />
        <Route path="jobs" component={JobListPage} />
        <Route path="jobs/new" component={NewJobPage} />
        <Route path="jobs/:jobId" component={JobPage} />
        <Route path="new/query" component={NewQueryTransformPage} />
        <Route path="new/native" component={NewNativeTransformPage} />
        <Route path="new/card/:cardId" component={NewCardTransformPage} />
        {PLUGIN_TRANSFORMS_PYTHON.isEnabled && (
          <Route path="new/python" component={NewPythonTransformPage} />
        )}
        <Route path=":transformId" component={TransformQueryPage} />
        <Route path=":transformId/edit" component={TransformQueryPage} />
        <Route path=":transformId/run" component={TransformRunPage} />
        <Route path=":transformId/settings" component={TransformSettingsPage} />
        <Route path=":transformId/inspect" component={TransformInspectPage} />
        <Route path=":transformId/inspect-v2" component={TransformInspectV2Page} />
        <Route
          path=":transformId/inspect-mock"
          component={TransformInspectPageMock}
        />
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
