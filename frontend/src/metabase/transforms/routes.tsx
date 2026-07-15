import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_REPLACEMENT,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { Route } from "metabase/router";

import { JobListPage } from "./pages/JobListPage";
import { JobPage } from "./pages/JobPage";
import { JobRunListPage } from "./pages/JobRunListPage";
import { JobSectionLayout } from "./pages/JobSectionLayout";
import { NewJobPage } from "./pages/NewJobPage";
import {
  NewCardTransformPage,
  NewNativeTransformPage,
  NewQueryTransformPage,
} from "./pages/NewTransformPage";
import { RunListPage } from "./pages/RunListPage";
import { TransformDependenciesPage } from "./pages/TransformDependenciesPage";
import { TransformIndexesPage } from "./pages/TransformIndexesPage";
import { TransformListPage } from "./pages/TransformListPage";
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformRunPage } from "./pages/TransformRunPage";
import { TransformSettingsPage } from "./pages/TransformSettingsPage";
import { TransformsNotDisabled } from "./route-guards";

export function getDataStudioTransformRoutes() {
  return (
    <Route component={TransformsNotDisabled}>
      <Route index component={TransformListPage} />
      <Route path="runs" component={RunListPage} />
      <Route path="jobs" component={JobSectionLayout}>
        <Route index component={JobListPage} />
        <Route path="new" component={NewJobPage} />
        <Route path=":jobId" component={JobPage} />
        <Route path=":jobId/runs" component={JobRunListPage} />
      </Route>

      <Route path="new/query" component={NewQueryTransformPage} />
      <Route path="new/native" component={NewNativeTransformPage} />
      <Route path="new/card/:cardId" component={NewCardTransformPage} />
      <Route path=":transformId" component={TransformQueryPage} />
      <Route path=":transformId/edit" component={TransformQueryPage} />
      <Route path=":transformId/run" component={TransformRunPage} />
      <Route path=":transformId/settings" component={TransformSettingsPage} />
      <Route path=":transformId/indexes" component={TransformIndexesPage} />
      {PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes()}
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":transformId/dependencies"
          component={TransformDependenciesPage}
        >
          <Route index component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
      {PLUGIN_TRANSFORMS_PYTHON.getPythonTransformsRoutes()}
      {PLUGIN_REPLACEMENT.getTransformToolsRoutes()}
    </Route>
  );
}
