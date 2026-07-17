import { NotFound } from "metabase/common/components/ErrorPages";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { canAccessMonitorDiagnostics } from "metabase/common/monitor/selectors";
import { DependencyDiagnosticsSectionLayout } from "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsSectionLayout";
import { DependencyDiagnosticsUpsellPage } from "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsUpsellPage";
import { JobInfoApp } from "metabase/monitor/tools/components/JobInfoApp";
import { LogLevelsModal } from "metabase/monitor/tools/components/LogLevelsModal";
import { Logs } from "metabase/monitor/tools/components/Logs";
import {
  ModelCachePage,
  ModelCacheRefreshJobModal,
} from "metabase/monitor/tools/components/ModelCacheRefreshJobs";
import { MonitorUpsell } from "metabase/monitor/tools/components/MonitorUpsell";
import {
  getNotificationsRoutes,
  getTasksRoutes,
} from "metabase/monitor/tools/routes";
import { PLUGIN_MONITOR, PLUGIN_MONITOR_TOOLS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import {
  Navigate,
  Route,
  type RouteComponent,
  redirect,
} from "metabase/router";
import * as Urls from "metabase/urls";

import { MonitorLayout } from "./components/MonitorLayout";

/** Lands on the first Monitor section the user can access. */
function MonitorIndexRedirect() {
  const indexPath = useSelector(getMonitorIndexPath);
  return <Navigate to={indexPath} replace />;
}

export function getMonitorRoutes(
  CanAccessMonitor: RouteComponent,
  CanAccessMonitorDiagnostics: RouteComponent,
  CanAccessMonitoringTools: RouteComponent,
  CanAccessAlertsManagement: RouteComponent,
) {
  return (
    <Route component={CanAccessMonitor}>
      <Route path="monitor" component={MonitorLayout}>
        <Route index component={MonitorIndexRedirect} />
        <Route component={CanAccessMonitorDiagnostics}>
          {PLUGIN_MONITOR.isDependencyDiagnosticsEnabled ? (
            <Route
              path="dependency-diagnostics"
              component={DependencyDiagnosticsSectionLayout}
            >
              {PLUGIN_MONITOR.getDependencyDiagnosticsRoutes()}
            </Route>
          ) : (
            <Route path="dependency-diagnostics">
              <Route index component={DependencyDiagnosticsUpsellPage} />
              <Route path="*" component={DependencyDiagnosticsUpsellPage} />
            </Route>
          )}
        </Route>

        <Route component={CanAccessMonitoringTools}>
          <Route path="tasks">{getTasksRoutes()}</Route>
          <Route path="jobs" component={JobInfoApp}>
            <Route path=":jobKey" />
          </Route>
          <Route path="logs" component={Logs}>
            {modalRoute("levels", LogLevelsModal)}
          </Route>
          <Route
            path="errors"
            component={PLUGIN_MONITOR_TOOLS.COMPONENT || MonitorUpsell}
          />
          <Route path="model-caching" component={ModelCachePage}>
            {modalRoute(":jobId", ModelCacheRefreshJobModal)}
          </Route>
        </Route>

        <Route component={CanAccessAlertsManagement}>
          <Route path="notifications">{getNotificationsRoutes()}</Route>
        </Route>

        <Route path="*" component={NotFound} />
      </Route>
    </Route>
  );
}

// Diagnostics for analysts/admins; otherwise the Tools pages for users who only
// hold the monitoring application permission.
function getMonitorIndexPath(state: State) {
  return canAccessMonitorDiagnostics(state)
    ? Urls.dependencyDiagnostics()
    : Urls.monitorTasks();
}

/**
 * Legacy redirects for views that moved into the Monitor area:
 * - Dependency Diagnostics: Data Studio → Monitor.
 * - Admin Tools pages:
 *   - /admin/tools → /monitor
 *   - /admin/tools/help → /admin/help
 */
export function getMonitorRedirects() {
  return (
    <>
      <Route
        path="/data-studio/dependency-diagnostics"
        component={redirect(Urls.dependencyDiagnostics())}
      />
      <Route
        path="/data-studio/dependency-diagnostics/*"
        component={redirect(`${Urls.dependencyDiagnostics()}/*`)}
      />

      <Route path="/admin/tools/help" component={redirect(Urls.adminHelp())} />
      <Route
        path="/admin/tools/help/*"
        component={redirect(`${Urls.adminHelp()}/*`)}
      />
      <Route
        path="/admin/tools/tasks"
        component={redirect(Urls.monitorTasks())}
      />
      <Route
        path="/admin/tools/tasks/*"
        component={redirect(`${Urls.monitorTasks()}/*`)}
      />
      <Route
        path="/admin/tools/jobs"
        component={redirect(Urls.monitorJobs())}
      />
      <Route
        path="/admin/tools/jobs/*"
        component={redirect(`${Urls.monitorJobs()}/*`)}
      />
      <Route
        path="/admin/tools/logs"
        component={redirect(Urls.monitorLogs())}
      />
      <Route
        path="/admin/tools/logs/*"
        component={redirect(`${Urls.monitorLogs()}/*`)}
      />
      <Route
        path="/admin/tools/errors"
        component={redirect(Urls.monitorErroringQuestions())}
      />
      <Route
        path="/admin/tools/model-caching"
        component={redirect(Urls.monitorModelCaching())}
      />
      <Route
        path="/admin/tools/model-caching/*"
        component={redirect(`${Urls.monitorModelCaching()}/*`)}
      />
      <Route
        path="/admin/tools/notifications"
        component={redirect(Urls.monitorNotifications())}
      />
      <Route
        path="/admin/tools/notifications/*"
        component={redirect(`${Urls.monitorNotifications()}/*`)}
      />
      <Route path="/admin/tools" component={redirect(Urls.monitor())} />
    </>
  );
}
