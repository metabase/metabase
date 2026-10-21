import { Route } from "metabase/router";

const testListPage = () =>
  import(
    /* webpackChunkName: "transforms-testing" */ "./pages/TransformTestListPage"
  ).then(({ TransformTestListPage }) => ({
    Component: TransformTestListPage,
  }));

const testOverviewPage = () =>
  import(
    /* webpackChunkName: "transforms-testing" */ "./pages/TransformTestOverviewPage"
  ).then(({ TransformTestOverviewPage }) => ({
    Component: TransformTestOverviewPage,
  }));

const testRunsPage = () =>
  import(
    /* webpackChunkName: "transforms-testing" */ "./pages/TransformTestRunsPage"
  ).then(({ TransformTestRunsPage }) => ({
    Component: TransformTestRunsPage,
  }));

export function getTransformTestRoutes() {
  return (
    <>
      <Route path=":transformId/tests" lazy={testListPage} />
      <Route path=":transformId/tests/:testId" lazy={testOverviewPage} />
      <Route path=":transformId/tests/:testId/runs" lazy={testRunsPage} />
    </>
  );
}
