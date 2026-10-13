import { Outlet, Route, redirect } from "metabase/router";
import { useGetDependencyCountsQuery } from "metabase-enterprise/api/dependencies";

/**
 * The two diagnostics pages sit behind one barrel, so a single `import()`
 * reaches both and they land in one chunk by construction.
 */
const pages = () =>
  import(/* webpackChunkName: "dependency-diagnostics" */ "./pages");

const brokenPage = () =>
  pages().then(({ BrokenDependencyDiagnosticsPage }) => ({
    Component: BrokenDependencyDiagnosticsPage,
  }));

const unreferencedPage = () =>
  pages().then(({ UnreferencedDependencyDiagnosticsPage }) => ({
    Component: UnreferencedDependencyDiagnosticsPage,
  }));

/** Keeps default-population counts subscribed across tabs and refreshes on section entry. */
export function DependencyDiagnosticsSectionLayout() {
  useGetDependencyCountsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  return <Outlet />;
}

/** Returns the Dependency diagnostics pages with section-owned count freshness. */
export function getDependencyDiagnosticsRoutes() {
  return (
    <Route element={<DependencyDiagnosticsSectionLayout />}>
      <Route index element={redirect("broken")} />
      <Route path="broken" lazy={brokenPage} />
      <Route path="unreferenced" lazy={unreferencedPage} />
    </Route>
  );
}
