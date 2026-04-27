import { IndexRoute, Route } from "react-router";

import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_REPLACEMENT,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";

import { JobListPage } from "./pages/JobListPage";
import { JobPage } from "./pages/JobPage";
import { JobSectionLayout } from "./pages/JobSectionLayout";
import { NewJobPage } from "./pages/NewJobPage";
import {
  NewCardTransformPage,
  NewNativeTransformPage,
  NewQueryTransformPage,
} from "./pages/NewTransformPage";
import { RunListPage } from "./pages/RunListPage";
import { TransformDependenciesPage } from "./pages/TransformDependenciesPage";
import { TransformListPage } from "./pages/TransformListPage";
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformRunPage } from "./pages/TransformRunPage";
import { TransformSettingsPage } from "./pages/TransformSettingsPage";

export function getDataStudioTransformRoutes() {
  return (
    <>
      <Route path="runs" component={RunListPage} />
      <Route>
        <IndexRoute component={TransformListPage} />
        <Route path="jobs" component={JobSectionLayout}>
          <IndexRoute component={JobListPage} />
          <Route path="new" component={NewJobPage} />
          <Route path=":jobId" component={JobPage} />
        </Route>

        <Route path="new/query" component={NewQueryTransformPage} />
        <Route path="new/native" component={NewNativeTransformPage} />
        <Route path="new/card/:cardId" component={NewCardTransformPage} />
        <Route path=":transformId" component={TransformQueryPage} />
        <Route path=":transformId/edit" component={TransformQueryPage} />
        <Route path=":transformId/run" component={TransformRunPage} />
        <Route path=":transformId/settings" component={TransformSettingsPage} />
        {PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes()}
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route
            path=":transformId/dependencies"
            component={TransformDependenciesPage}
          >
            <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
          </Route>
        )}
        {PLUGIN_TRANSFORMS_PYTHON.getPythonTransformsRoutes()}
        {PLUGIN_REPLACEMENT.getTransformToolsRoutes()}
      </Route>
    </>
  );
}
