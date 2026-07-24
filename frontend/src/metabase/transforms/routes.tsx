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
import { RunsPage } from "./pages/RunsPage";
import { TransformDependenciesPage } from "./pages/TransformDependenciesPage";
import { TransformGraphRunListPage } from "./pages/TransformGraphRunListPage";
import { TransformIndexesPage } from "./pages/TransformIndexesPage";
import { TransformListPage } from "./pages/TransformListPage";
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformRunPage } from "./pages/TransformRunPage";
import { TransformSettingsPage } from "./pages/TransformSettingsPage";
import { TransformsNotDisabled } from "./route-guards";

export function getDataStudioTransformRoutes() {
  return (
    <Route element={<TransformsNotDisabled />}>
      <Route index element={<TransformListPage />} />
      <Route path="runs" element={<RunsPage />}>
        <Route index element={<TransformGraphRunListPage />} />
        <Route path="individual" element={<RunListPage />} />
      </Route>
      <Route path="jobs" element={<JobSectionLayout />}>
        <Route index element={<JobListPage />} />
        <Route path="new" element={<NewJobPage />} />
        <Route path=":jobId" element={<JobPage />} />
        <Route path=":jobId/runs" element={<JobRunListPage />} />
      </Route>

      <Route path="new/query" element={<NewQueryTransformPage />} />
      <Route path="new/native" element={<NewNativeTransformPage />} />
      <Route path="new/card/:cardId" element={<NewCardTransformPage />} />
      <Route path=":transformId" element={<TransformQueryPage />} />
      <Route path=":transformId/edit" element={<TransformQueryPage />} />
      <Route path=":transformId/run" element={<TransformRunPage />} />
      <Route path=":transformId/settings" element={<TransformSettingsPage />} />
      <Route path=":transformId/indexes" element={<TransformIndexesPage />} />
      {PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes()}
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":transformId/dependencies"
          element={<TransformDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      {PLUGIN_TRANSFORMS_PYTHON.getPythonTransformsRoutes()}
      {PLUGIN_REPLACEMENT.getTransformToolsRoutes()}
    </Route>
  );
}
