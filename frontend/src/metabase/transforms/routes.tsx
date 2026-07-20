import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_REPLACEMENT,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { Route, withRouteProps } from "metabase/router";

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

const RoutedTransformListPage = withRouteProps(TransformListPage);
const RoutedRunListPage = withRouteProps(RunListPage);
const RoutedNewJobPage = withRouteProps(NewJobPage);
const RoutedJobPage = withRouteProps(JobPage);
const RoutedJobRunListPage = withRouteProps(JobRunListPage);
const RoutedNewQueryTransformPage = withRouteProps(NewQueryTransformPage);
const RoutedNewNativeTransformPage = withRouteProps(NewNativeTransformPage);
const RoutedNewCardTransformPage = withRouteProps(NewCardTransformPage);
const RoutedTransformQueryPage = withRouteProps(TransformQueryPage);
const RoutedTransformRunPage = withRouteProps(TransformRunPage);
const RoutedTransformSettingsPage = withRouteProps(TransformSettingsPage);
const RoutedTransformIndexesPage = withRouteProps(TransformIndexesPage);
const RoutedTransformDependenciesPage = withRouteProps(
  TransformDependenciesPage,
);

export function getDataStudioTransformRoutes() {
  return (
    <Route element={<TransformsNotDisabled />}>
      <Route index element={<RoutedTransformListPage />} />
      <Route path="runs" element={<RoutedRunListPage />} />
      <Route path="jobs" element={<JobSectionLayout />}>
        <Route index element={<JobListPage />} />
        <Route path="new" element={<RoutedNewJobPage />} />
        <Route path=":jobId" element={<RoutedJobPage />} />
        <Route path=":jobId/runs" element={<RoutedJobRunListPage />} />
      </Route>

      <Route path="new/query" element={<RoutedNewQueryTransformPage />} />
      <Route path="new/native" element={<RoutedNewNativeTransformPage />} />
      <Route path="new/card/:cardId" element={<RoutedNewCardTransformPage />} />
      <Route path=":transformId" element={<RoutedTransformQueryPage />} />
      <Route path=":transformId/edit" element={<RoutedTransformQueryPage />} />
      <Route path=":transformId/run" element={<RoutedTransformRunPage />} />
      <Route
        path=":transformId/settings"
        element={<RoutedTransformSettingsPage />}
      />
      <Route
        path=":transformId/indexes"
        element={<RoutedTransformIndexesPage />}
      />
      {PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes()}
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":transformId/dependencies"
          element={<RoutedTransformDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      {PLUGIN_TRANSFORMS_PYTHON.getPythonTransformsRoutes()}
      {PLUGIN_REPLACEMENT.getTransformToolsRoutes()}
    </Route>
  );
}
