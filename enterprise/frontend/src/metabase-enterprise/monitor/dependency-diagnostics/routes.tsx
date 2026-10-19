import {
  dependencyDiagnosticsSectionLayout,
  dependencyDiagnosticsUpsellPage,
} from "metabase/monitor/routes";
import {
  notFoundRoute,
  outletRoute,
  redirectRoute,
} from "metabase/plugins/components/PluginPlaceholder";
import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

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

const gated = (enabled: Parameters<typeof featureGatedRoute>[1]) =>
  featureGatedRoute("dependencies", enabled, dependencyDiagnosticsUpsellPage);

export function getDependencyDiagnosticsRoutes() {
  return (
    <Route
      lazy={featureGatedRoute(
        "dependencies",
        dependencyDiagnosticsSectionLayout,
        outletRoute,
      )}
    >
      <Route index lazy={gated(redirectRoute("broken"))} />
      <Route path="broken" lazy={gated(brokenPage)} />
      <Route path="unreferenced" lazy={gated(unreferencedPage)} />
      <Route path="*" lazy={gated(notFoundRoute)} />
    </Route>
  );
}
