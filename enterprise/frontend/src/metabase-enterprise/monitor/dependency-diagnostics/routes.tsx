import { Route, redirect } from "metabase/router";

/**
 * The two diagnostics pages sit behind one barrel under one chunk name, so they
 * land in one chunk. Each loader names it, rather than sharing a helper that
 * does, so the preload manifest can read it off the route.
 */
const brokenPage = () =>
  import(/* webpackChunkName: "dependency-diagnostics" */ "./pages").then(
    ({ BrokenDependencyDiagnosticsPage }) => ({
      Component: BrokenDependencyDiagnosticsPage,
    }),
  );

const unreferencedPage = () =>
  import(/* webpackChunkName: "dependency-diagnostics" */ "./pages").then(
    ({ UnreferencedDependencyDiagnosticsPage }) => ({
      Component: UnreferencedDependencyDiagnosticsPage,
    }),
  );

export function getDependencyDiagnosticsRoutes() {
  return (
    <>
      <Route index element={redirect("broken")} />
      <Route path="broken" lazy={brokenPage} />
      <Route path="unreferenced" lazy={unreferencedPage} />
    </>
  );
}
