import { notFoundRoute } from "metabase/plugins/components/PluginPlaceholder";
import type { PluginRoute } from "metabase/plugins/types";
import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

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

const gated = (enabled: PluginRoute) =>
  featureGatedRoute("transforms-testing", enabled, notFoundRoute);

export function getTransformTestRoutes() {
  return (
    <>
      <Route path=":transformId/tests" lazy={gated(testListPage)} />
      <Route path=":transformId/tests/:testId" lazy={gated(testOverviewPage)} />
      <Route
        path=":transformId/tests/:testId/runs"
        lazy={gated(testRunsPage)}
      />
    </>
  );
}
