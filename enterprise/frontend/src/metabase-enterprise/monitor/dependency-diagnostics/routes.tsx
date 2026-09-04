import { Route, redirect } from "metabase/router";

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

export function getDependencyDiagnosticsRoutes() {
  return (
    <>
      <Route index element={redirect("broken")} />
      <Route path="broken" lazy={brokenPage} />
      <Route path="unreferenced" lazy={unreferencedPage} />
    </>
  );
}
