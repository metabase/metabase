import {
  IndexRedirect,
  IndexRoute,
  Redirect,
  Route,
  type RouteComponent,
} from "react-router";

import { DependencyDiagnosticsSectionLayout } from "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsSectionLayout";
import { DependencyDiagnosticsUpsellPage } from "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsUpsellPage";
import { PLUGIN_MONITOR } from "metabase/plugins";

import { MonitorLayout } from "./MonitorLayout";

export function getMonitorRoutes(CanAccessMonitor: RouteComponent) {
  return (
    <Route component={CanAccessMonitor}>
      <Route path="monitor" component={MonitorLayout}>
        <IndexRedirect to="dependency-diagnostics" />
        {PLUGIN_MONITOR.isDependencyDiagnosticsEnabled ? (
          <Route
            path="dependency-diagnostics"
            component={DependencyDiagnosticsSectionLayout}
          >
            {PLUGIN_MONITOR.getDependencyDiagnosticsRoutes()}
          </Route>
        ) : (
          <Route path="dependency-diagnostics">
            <IndexRoute component={DependencyDiagnosticsUpsellPage} />
            {/* Catch sub-paths (e.g. /broken, /unreferenced) redirected from the
                old Data Studio URLs so OSS lands on the upsell, not NotFound. */}
            <Route path="*" component={DependencyDiagnosticsUpsellPage} />
          </Route>
        )}
      </Route>
    </Route>
  );
}

/**
 * Legacy redirects for the Dependency Diagnostics view, which moved from the
 * Data Studio space to the Monitor space. Mounted at the top level of the app
 * route tree in `metabase/routes`.
 */
export function getMonitorRedirects() {
  return (
    <>
      <Redirect
        from="/data-studio/dependency-diagnostics"
        to="/monitor/dependency-diagnostics"
      />
      <Redirect
        from="/data-studio/dependency-diagnostics/*"
        to="/monitor/dependency-diagnostics/*"
      />
    </>
  );
}
