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

const testRunPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/TransformTestRunPage"
  ).then(({ TransformTestRunPage }) => ({
    Component: TransformTestRunPage,
  }));

export function getTransformTestRoutes() {
  return (
    <>
      <Route path=":transformId/tests" lazy={testListPage} />
      <Route path=":transformId/tests/:testId" lazy={testOverviewPage} />
      <Route path=":transformId/tests/:testId/runs" lazy={testRunsPage} />
      <Route path=":transformId/tests/:testId/runs/:runId" lazy={testRunPage} />
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

const cardTestRunPage = () =>
  import(/* webpackChunkName: "data-testing" */ "./pages/CardTestRunPage").then(
    ({ CardTestRunPage }) => ({
      Component: CardTestRunPage,
    }),
  );

export function getMetricTestRoutes() {
  return (
    <>
      <Route path=":cardId/tests" lazy={cardTestListPage} />
      <Route path=":cardId/tests/:testId" lazy={cardTestOverviewPage} />
      <Route path=":cardId/tests/:testId/runs" lazy={cardTestRunsPage} />
      <Route path=":cardId/tests/:testId/runs/:runId" lazy={cardTestRunPage} />
    </>
  );
}

const publishedTableSegmentTestListPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/SegmentTestListPage"
  ).then(({ PublishedTableSegmentTestListPage }) => ({
    Component: PublishedTableSegmentTestListPage,
  }));

const dataModelSegmentTestListPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/SegmentTestListPage"
  ).then(({ DataModelSegmentTestListPage }) => ({
    Component: DataModelSegmentTestListPage,
  }));

const segmentTestOverviewPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/SegmentTestOverviewPage"
  ).then(({ SegmentTestOverviewPage }) => ({
    Component: SegmentTestOverviewPage,
  }));

const segmentTestRunsPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/SegmentTestRunsPage"
  ).then(({ SegmentTestRunsPage }) => ({
    Component: SegmentTestRunsPage,
  }));

const segmentTestRunPage = () =>
  import(
    /* webpackChunkName: "data-testing" */ "./pages/SegmentTestRunPage"
  ).then(({ SegmentTestRunPage }) => ({
    Component: SegmentTestRunPage,
  }));

const PUBLISHED_TABLE_SEGMENT_TESTS_PATH = ":tableId/segments/:segmentId/tests";

export function getPublishedTableSegmentTestRoutes() {
  return (
    <>
      <Route
        path={PUBLISHED_TABLE_SEGMENT_TESTS_PATH}
        lazy={publishedTableSegmentTestListPage}
      />
      <Route
        path={`${PUBLISHED_TABLE_SEGMENT_TESTS_PATH}/:testId`}
        lazy={segmentTestOverviewPage}
      />
      <Route
        path={`${PUBLISHED_TABLE_SEGMENT_TESTS_PATH}/:testId/runs`}
        lazy={segmentTestRunsPage}
      />
      <Route
        path={`${PUBLISHED_TABLE_SEGMENT_TESTS_PATH}/:testId/runs/:runId`}
        lazy={segmentTestRunPage}
      />
    </>
  );
}

const DATA_MODEL_SEGMENT_TESTS_PATH =
  "database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/tests";

export function getDataModelSegmentTestRoutes() {
  return (
    <>
      <Route
        path={DATA_MODEL_SEGMENT_TESTS_PATH}
        lazy={dataModelSegmentTestListPage}
      />
      <Route
        path={`${DATA_MODEL_SEGMENT_TESTS_PATH}/:testId`}
        lazy={segmentTestOverviewPage}
      />
      <Route
        path={`${DATA_MODEL_SEGMENT_TESTS_PATH}/:testId/runs`}
        lazy={segmentTestRunsPage}
      />
      <Route
        path={`${DATA_MODEL_SEGMENT_TESTS_PATH}/:testId/runs/:runId`}
        lazy={segmentTestRunPage}
      />
    </>
  );
}
