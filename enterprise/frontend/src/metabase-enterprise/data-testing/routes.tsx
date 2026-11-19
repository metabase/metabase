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
    </>
  );
}
