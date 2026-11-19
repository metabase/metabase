import { Route } from "metabase/router";

const testListPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/TransformTestListPage"
  ).then(({ TransformTestListPage }) => ({
    Component: TransformTestListPage,
  }));

const testOverviewPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/TransformTestOverviewPage"
  ).then(({ TransformTestOverviewPage }) => ({
    Component: TransformTestOverviewPage,
  }));

const testRunsPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/TransformTestRunsPage"
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

const cardTestListPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/CardTestListPage"
  ).then(({ CardTestListPage }) => ({
    Component: CardTestListPage,
  }));

const cardTestOverviewPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/CardTestOverviewPage"
  ).then(({ CardTestOverviewPage }) => ({
    Component: CardTestOverviewPage,
  }));

const cardTestRunsPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/CardTestRunsPage"
  ).then(({ CardTestRunsPage }) => ({
    Component: CardTestRunsPage,
  }));

export function getMetricTestRoutes() {
  return (
    <>
      <Route path=":cardId/tests" lazy={cardTestListPage} />
      <Route path=":cardId/tests/:testId" lazy={cardTestOverviewPage} />
      <Route path=":cardId/tests/:testId/runs" lazy={cardTestRunsPage} />
    </>
  );
}

const actionTestListPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/ActionTestListPage"
  ).then(({ ActionTestListPage }) => ({
    Component: ActionTestListPage,
  }));

const actionTestOverviewPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/ActionTestOverviewPage"
  ).then(({ ActionTestOverviewPage }) => ({
    Component: ActionTestOverviewPage,
  }));

const actionTestRunsPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/ActionTestRunsPage"
  ).then(({ ActionTestRunsPage }) => ({
    Component: ActionTestRunsPage,
  }));

export function getActionTestRoutes() {
  return (
    <>
      <Route path=":actionId/tests" lazy={actionTestListPage} />
      <Route path=":actionId/tests/:testId" lazy={actionTestOverviewPage} />
      <Route path=":actionId/tests/:testId/runs" lazy={actionTestRunsPage} />
    </>
  );
}
