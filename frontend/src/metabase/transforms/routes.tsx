import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_REPLACEMENT,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { Route } from "metabase/router";

import { TransformsNotDisabled } from "./route-guards";

/**
 * The transform pages, in one chunk. Every loader names it, so the section
 * arrives in a single request. Editing a transform means moving between its
 * query, run, settings and indexes tabs, and that should not cost a fetch each
 * time.
 *
 * The route guard stays eager: it has to decide before there is anything to
 * show.
 */
const transformListPage = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/TransformListPage").then(
    ({ TransformListPage }) => ({
      Component: TransformListPage,
    }),
  );

const runsPage = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/RunsPage").then(
    ({ RunsPage }) => ({ Component: RunsPage }),
  );

const transformGraphRunListPage = () =>
  import(
    /* webpackChunkName: "transforms" */ "./pages/TransformGraphRunListPage"
  ).then(({ TransformGraphRunListPage }) => ({
    Component: TransformGraphRunListPage,
  }));

const runListPage = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/RunListPage").then(
    ({ RunListPage }) => ({
      Component: RunListPage,
    }),
  );

const jobSectionLayout = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/JobSectionLayout").then(
    ({ JobSectionLayout }) => ({
      Component: JobSectionLayout,
    }),
  );

const jobListPage = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/JobListPage").then(
    ({ JobListPage }) => ({
      Component: JobListPage,
    }),
  );

const newJobPage = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/NewJobPage").then(
    ({ NewJobPage }) => ({
      Component: NewJobPage,
    }),
  );

const jobPage = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/JobPage").then(
    ({ JobPage }) => ({ Component: JobPage }),
  );

const jobRunListPage = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/JobRunListPage").then(
    ({ JobRunListPage }) => ({
      Component: JobRunListPage,
    }),
  );

const newQueryTransformPage = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/NewTransformPage").then(
    ({ NewQueryTransformPage }) => ({
      Component: NewQueryTransformPage,
    }),
  );

const newNativeTransformPage = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/NewTransformPage").then(
    ({ NewNativeTransformPage }) => ({
      Component: NewNativeTransformPage,
    }),
  );

const newCardTransformPage = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/NewTransformPage").then(
    ({ NewCardTransformPage }) => ({
      Component: NewCardTransformPage,
    }),
  );

const transformQueryPage = () =>
  import(
    /* webpackChunkName: "transforms" */ "./pages/TransformQueryPage"
  ).then(({ TransformQueryPage }) => ({
    Component: TransformQueryPage,
  }));

const transformRunPage = () =>
  import(/* webpackChunkName: "transforms" */ "./pages/TransformRunPage").then(
    ({ TransformRunPage }) => ({
      Component: TransformRunPage,
    }),
  );

const transformSettingsPage = () =>
  import(
    /* webpackChunkName: "transforms" */ "./pages/TransformSettingsPage"
  ).then(({ TransformSettingsPage }) => ({
    Component: TransformSettingsPage,
  }));

const transformIndexesPage = () =>
  import(
    /* webpackChunkName: "transforms" */ "./pages/TransformIndexesPage"
  ).then(({ TransformIndexesPage }) => ({
    Component: TransformIndexesPage,
  }));

const transformDependenciesPage = () =>
  import(
    /* webpackChunkName: "transforms" */ "./pages/TransformDependenciesPage"
  ).then(({ TransformDependenciesPage }) => ({
    Component: TransformDependenciesPage,
  }));

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
