import { IndexRedirect, Route, type RouteComponent } from "react-router";

import { DependencyDiagnosticsSectionLayout } from "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsSectionLayout";
import { DependencyDiagnosticsUpsellPage } from "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsUpsellPage";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { MonitorLayout } from "./MonitorLayout";

export function getMonitorRoutes(CanAccessMonitor: RouteComponent) {
  return (
    <Route component={CanAccessMonitor}>
      <Route path="monitor" component={MonitorLayout}>
        <IndexRedirect to="dependency-diagnostics" />
        {PLUGIN_DEPENDENCIES.isEnabled ? (
          <Route
            path="dependency-diagnostics"
            component={DependencyDiagnosticsSectionLayout}
          >
            {PLUGIN_DEPENDENCIES.getMonitorDependencyDiagnosticsRoutes()}
          </Route>
        ) : (
          <Route
            path="dependency-diagnostics"
            component={DependencyDiagnosticsUpsellPage}
          />
        )}
      </Route>
    </Route>
  );
}
