import {
  IndexRedirect,
  IndexRoute,
  Redirect,
  Route,
  type RouteComponent,
} from "react-router";

import { ModalRoute } from "metabase/hoc/ModalRoute";
import { ContentDiagnosticsSectionLayout } from "metabase/monitor/content-diagnostics/ContentDiagnosticsSectionLayout";
import { ContentDiagnosticsUpsellPage } from "metabase/monitor/content-diagnostics/ContentDiagnosticsUpsellPage";
import { DependencyDiagnosticsSectionLayout } from "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsSectionLayout";
import { DependencyDiagnosticsUpsellPage } from "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsUpsellPage";
import { JobInfoApp } from "metabase/monitor/tools/components/JobInfoApp";
import { JobTriggersModal } from "metabase/monitor/tools/components/JobTriggersModal";
import { LogLevelsModal } from "metabase/monitor/tools/components/LogLevelsModal";
import { Logs } from "metabase/monitor/tools/components/Logs";
import {
  ModelCachePage,
  ModelCacheRefreshJobModal,
} from "metabase/monitor/tools/components/ModelCacheRefreshJobs";
import { ToolsUpsell } from "metabase/monitor/tools/components/ToolsUpsell";
import {
  getNotificationsRoutes,
  getTasksRoutes,
} from "metabase/monitor/tools/routes";
import { PLUGIN_MONITOR, PLUGIN_MONITOR_TOOLS } from "metabase/plugins";

import { MonitorLayout } from "./components/MonitorLayout";

export function getMonitorRoutes(
  CanAccessMonitor: RouteComponent,
  CanAccessMonitoringTools: RouteComponent,
) {
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

        {PLUGIN_MONITOR.isContentDiagnosticsEnabled ? (
          <Route
            path="content-diagnostics"
            component={ContentDiagnosticsSectionLayout}
          >
            {PLUGIN_MONITOR.getContentDiagnosticsRoutes()}
          </Route>
        ) : (
          <Route path="content-diagnostics">
            <IndexRoute component={ContentDiagnosticsUpsellPage} />
            <Route path="*" component={ContentDiagnosticsUpsellPage} />
          </Route>
        )}

        {/* Admin Tools pages migrated from /admin/tools (GDGT-2684), mounted
            here as siblings of Dependency diagnostics. The padded, transparent
            content chrome is provided by MonitorLayout. These keep their
            original superuser-or-monitoring access (CanAccessMonitoringTools)
            rather than the broader analyst-level Monitor guard above. */}
        <Route component={CanAccessMonitoringTools}>
          <Route path="tasks">{getTasksRoutes()}</Route>
          <Route path="notifications">{getNotificationsRoutes()}</Route>
          <Route path="jobs" component={JobInfoApp}>
            <ModalRoute
              path=":jobKey"
              modal={JobTriggersModal}
              modalProps={{ size: "85%" }}
            />
          </Route>
          <Route path="logs" component={Logs}>
            <ModalRoute path="levels" modal={LogLevelsModal} />
          </Route>
          {/* Erroring questions: EE (audit_app) injects the component via
              PLUGIN_MONITOR_TOOLS; OSS falls back to the upsell. */}
          <Route
            path="errors"
            component={PLUGIN_MONITOR_TOOLS.COMPONENT || ToolsUpsell}
          />
          <Route path="model-caching" component={ModelCachePage}>
            <ModalRoute path=":jobId" modal={ModelCacheRefreshJobModal} />
          </Route>
        </Route>
      </Route>
    </Route>
  );
}

/**
 * Legacy redirects for views that moved into the Monitor area, mounted at the
 * top level of the app route tree in `metabase/routes`:
 * - Dependency Diagnostics: Data Studio → Monitor.
 * - Admin Tools pages: /admin/tools → /monitor (GDGT-2684). Help is the
 *   exception — it stays in Admin, moving to /admin/help.
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

      {/* Help stays in Admin (GDGT-2684); preserve its nested grant-access
          modal bookmark via the splat redirect. */}
      <Redirect from="/admin/tools/help/*" to="/admin/help/*" />
      <Redirect from="/admin/tools/help" to="/admin/help" />
      <Redirect from="/admin/tools/tasks" to="/monitor/tasks" />
      <Redirect from="/admin/tools/tasks/*" to="/monitor/tasks/*" />
      <Redirect from="/admin/tools/jobs" to="/monitor/jobs" />
      <Redirect from="/admin/tools/jobs/*" to="/monitor/jobs/*" />
      <Redirect from="/admin/tools/logs" to="/monitor/logs" />
      <Redirect from="/admin/tools/logs/*" to="/monitor/logs/*" />
      <Redirect from="/admin/tools/errors" to="/monitor/errors" />
      <Redirect from="/admin/tools/model-caching" to="/monitor/model-caching" />
      <Redirect
        from="/admin/tools/model-caching/*"
        to="/monitor/model-caching/*"
      />
      <Redirect from="/admin/tools/notifications" to="/monitor/notifications" />
      <Redirect
        from="/admin/tools/notifications/*"
        to="/monitor/notifications/*"
      />
      <Redirect from="/admin/tools" to="/admin/help" />
    </>
  );
}
