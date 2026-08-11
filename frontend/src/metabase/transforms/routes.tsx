import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_REPLACEMENT,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { Route } from "metabase/router";

import { TransformsNotDisabled } from "./route-guards";

/**
 * The transform pages, in their own chunk. The route guard stays eager: it has
 * to decide before there is anything to show.
 */
const transformListPage = () =>
  import("./pages/TransformListPage").then(({ TransformListPage }) => ({
    Component: TransformListPage,
  }));

const runsPage = () =>
  import("./pages/RunsPage").then(({ RunsPage }) => ({ Component: RunsPage }));

const transformGraphRunListPage = () =>
  import("./pages/TransformGraphRunListPage").then(
    ({ TransformGraphRunListPage }) => ({
      Component: TransformGraphRunListPage,
    }),
  );

const runListPage = () =>
  import("./pages/RunListPage").then(({ RunListPage }) => ({
    Component: RunListPage,
  }));

const jobSectionLayout = () =>
  import("./pages/JobSectionLayout").then(({ JobSectionLayout }) => ({
    Component: JobSectionLayout,
  }));

const jobListPage = () =>
  import("./pages/JobListPage").then(({ JobListPage }) => ({
    Component: JobListPage,
  }));

const newJobPage = () =>
  import("./pages/NewJobPage").then(({ NewJobPage }) => ({
    Component: NewJobPage,
  }));

const jobPage = () =>
  import("./pages/JobPage").then(({ JobPage }) => ({ Component: JobPage }));

const jobRunListPage = () =>
  import("./pages/JobRunListPage").then(({ JobRunListPage }) => ({
    Component: JobRunListPage,
  }));

const newQueryTransformPage = () =>
  import("./pages/NewTransformPage").then(({ NewQueryTransformPage }) => ({
    Component: NewQueryTransformPage,
  }));

const newNativeTransformPage = () =>
  import("./pages/NewTransformPage").then(({ NewNativeTransformPage }) => ({
    Component: NewNativeTransformPage,
  }));

const newCardTransformPage = () =>
  import("./pages/NewTransformPage").then(({ NewCardTransformPage }) => ({
    Component: NewCardTransformPage,
  }));

const transformQueryPage = () =>
  import("./pages/TransformQueryPage").then(({ TransformQueryPage }) => ({
    Component: TransformQueryPage,
  }));

const transformRunPage = () =>
  import("./pages/TransformRunPage").then(({ TransformRunPage }) => ({
    Component: TransformRunPage,
  }));

const transformSettingsPage = () =>
  import("./pages/TransformSettingsPage").then(({ TransformSettingsPage }) => ({
    Component: TransformSettingsPage,
  }));

const transformIndexesPage = () =>
  import("./pages/TransformIndexesPage").then(({ TransformIndexesPage }) => ({
    Component: TransformIndexesPage,
  }));

const transformDependenciesPage = () =>
  import("./pages/TransformDependenciesPage").then(
    ({ TransformDependenciesPage }) => ({
      Component: TransformDependenciesPage,
    }),
  );

export function getDataStudioTransformRoutes() {
  return (
    <Route element={<TransformsNotDisabled />}>
      <Route index lazy={transformListPage} />
      <Route path="runs" lazy={runsPage}>
        <Route index lazy={transformGraphRunListPage} />
        <Route path="individual" lazy={runListPage} />
      </Route>
      <Route path="jobs" lazy={jobSectionLayout}>
        <Route index lazy={jobListPage} />
        <Route path="new" lazy={newJobPage} />
        <Route path=":jobId" lazy={jobPage} />
        <Route path=":jobId/runs" lazy={jobRunListPage} />
      </Route>

      <Route path="new/query" lazy={newQueryTransformPage} />
      <Route path="new/native" lazy={newNativeTransformPage} />
      <Route path="new/card/:cardId" lazy={newCardTransformPage} />
      <Route path=":transformId" lazy={transformQueryPage} />
      <Route path=":transformId/edit" lazy={transformQueryPage} />
      <Route path=":transformId/run" lazy={transformRunPage} />
      <Route path=":transformId/settings" lazy={transformSettingsPage} />
      <Route path=":transformId/indexes" lazy={transformIndexesPage} />
      {PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes()}
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":transformId/dependencies"
          lazy={transformDependenciesPage}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      {PLUGIN_TRANSFORMS_PYTHON.getPythonTransformsRoutes()}
      {PLUGIN_REPLACEMENT.getTransformToolsRoutes()}
    </Route>
  );
}
