import { createElement } from "react";

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
  withRouteProps,
} from "metabase/router";
import * as Urls from "metabase/urls";

import { MonitorLayout } from "./components/MonitorLayout";

const RoutedJobInfoApp = withRouteProps(JobInfoApp);

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
    <Route element={<CanAccessMonitor />}>
      <Route path="monitor" element={<MonitorLayout />}>
        <Route index element={<MonitorIndexRedirect />} />
        <Route element={<CanAccessMonitorDiagnostics />}>
          {PLUGIN_MONITOR.isDependencyDiagnosticsEnabled ? (
            <Route
              path="dependency-diagnostics"
              element={<DependencyDiagnosticsSectionLayout />}
            >
              {PLUGIN_MONITOR.getDependencyDiagnosticsRoutes()}
            </Route>
          ) : (
            <Route path="dependency-diagnostics">
              <Route index element={<DependencyDiagnosticsUpsellPage />} />
              <Route path="*" element={<DependencyDiagnosticsUpsellPage />} />
            </Route>
          )}
        </Route>

        <Route element={<CanAccessMonitoringTools />}>
          <Route path="tasks">{getTasksRoutes()}</Route>
          <Route path="jobs" element={<RoutedJobInfoApp />}>
            <Route path=":jobKey" />
          </Route>
          <Route path="logs" element={<Logs />}>
            {modalRoute("levels", LogLevelsModal)}
          </Route>
          <Route
            path="errors"
            element={createElement(
              PLUGIN_MONITOR_TOOLS.COMPONENT || MonitorUpsell,
            )}
          />
          <Route path="model-caching" element={<ModelCachePage />}>
            {modalRoute(":jobId", ModelCacheRefreshJobModal)}
          </Route>
        </Route>

        <Route element={<CanAccessAlertsManagement />}>
          <Route path="notifications">{getNotificationsRoutes()}</Route>
        </Route>

        <Route path="*" element={<NotFound />} />
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
 * Legacy redirects for Admin Tools pages that moved into the Monitor area:
 *   - /admin/tools → /monitor
 *   - /admin/tools/help → /admin/help
 *
 * The Data Studio → Monitor redirect for Dependency Diagnostics lives in
 * data-studio/routes.tsx instead: it must be declared inside the Data Studio
 * region (before that subtree's catch-all) so it isn't shadowed, yet outside the
 * Data Studio access guard so it forwards every user.
 */
export function getMonitorRedirects() {
  return (
    <>
      <Route path="/admin/tools/help" element={redirect(Urls.adminHelp())} />
      <Route
        path="/admin/tools/help/*"
        element={redirect(`${Urls.adminHelp()}/*`)}
      />
      <Route
        path="/admin/tools/tasks"
        element={redirect(Urls.monitorTasks())}
      />
      <Route
        path="/admin/tools/tasks/*"
        element={redirect(`${Urls.monitorTasks()}/*`)}
      />
      <Route path="/admin/tools/jobs" element={redirect(Urls.monitorJobs())} />
      <Route
        path="/admin/tools/jobs/*"
        element={redirect(`${Urls.monitorJobs()}/*`)}
      />
      <Route path="/admin/tools/logs" element={redirect(Urls.monitorLogs())} />
      <Route
        path="/admin/tools/logs/*"
        element={redirect(`${Urls.monitorLogs()}/*`)}
      />
      <Route
        path="/admin/tools/errors"
        element={redirect(Urls.monitorErroringQuestions())}
      />
      <Route
        path="/admin/tools/model-caching"
        element={redirect(Urls.monitorModelCaching())}
      />
      <Route
        path="/admin/tools/model-caching/*"
        element={redirect(`${Urls.monitorModelCaching()}/*`)}
      />
      <Route
        path="/admin/tools/notifications"
        element={redirect(Urls.monitorNotifications())}
      />
      <Route
        path="/admin/tools/notifications/*"
        element={redirect(`${Urls.monitorNotifications()}/*`)}
      />
      <Route path="/admin/tools" element={redirect(Urls.monitor())} />
    </>
  );
}
