import { Suspense, lazy } from "react";

import { DelayedLoadingSpinner } from "metabase/common/components/DelayedLoading";

/**
 * The dependency graph page, in its own chunk. It renders the graph with xyflow
 * and dagre, which nothing else in the initial bundle needs.
 */
export const loadDependencyGraphPage = () =>
  import(
    /* webpackChunkName: "dependency-graph" */ "./pages/DependencyGraphPage"
  );

const DependencyGraphPage = lazy(() =>
  loadDependencyGraphPage().then(({ DependencyGraphPage }) => ({
    default: DependencyGraphPage,
  })),
);

/**
 * The route file splits this page with a route-level `lazy`. This `React.lazy`
 * wrapper exists only for the `PLUGIN_DEPENDENCIES.DependencyGraphPage` slot,
 * which is a ComponentType rendered as a route `element` at over a dozen call
 * sites. Route-level `lazy` cannot express that, so the Suspense boundary lives
 * here rather than at every site.
 */
export const LazyDependencyGraphPage = () => (
  <Suspense fallback={<DelayedLoadingSpinner />}>
    <DependencyGraphPage />
  </Suspense>
);
