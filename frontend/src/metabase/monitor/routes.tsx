import { createElement } from "react";

import { loadCodeEditor } from "metabase/common/components/CodeEditor/lazy";
import { NotFound } from "metabase/common/components/ErrorPages";
import {
  lazyModalRouteElement,
  modalRoute,
} from "metabase/common/components/ModalRoute";
import { canAccessMonitorDiagnostics } from "metabase/common/monitor/selectors";
// From the file rather than the barrel beside it: the barrel also re-exports
// the page this file loads lazily, so importing the modal through it would hold
// the page in the initial bundle.
import { ModelPersistenceLogJobModal } from "metabase/monitor/tools/components/ModelPersistenceLogJobs/ModelPersistenceLogJobModal";
import { MonitorUpsell } from "metabase/monitor/tools/components/MonitorUpsell";
import {
  getNotificationsRoutes,
  getTasksRoutes,
} from "metabase/monitor/tools/routes";
import {
  PLUGIN_AUDIT,
  PLUGIN_MONITOR,
  PLUGIN_MONITOR_TOOLS,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { Navigate, Route, redirect } from "metabase/router";
import * as Urls from "metabase/urls";

import {
  CanAccessAiAuditing,
  CanAccessAlertsManagement,
  CanAccessMonitor,
  CanAccessMonitorDiagnostics,
  CanAccessMonitoringTools,
} from "./route-guards";

/** Lands on the first Monitor section the user can access. */
function MonitorIndexRedirect() {
  const indexPath = useSelector(getMonitorIndexPath);
  return <Navigate to={indexPath} replace />;
}

/**
 * The monitor pages, in their own chunk. The access guards stay eager: a guard
 * has to decide before there is anything to show. So does the job modal, which
 * is small. The log levels modal is not, so it has a loader of its own below.
 */
const monitorLayout = () =>
  import(/* webpackChunkName: "monitor" */ "./components/MonitorLayout").then(
    ({ MonitorLayout }) => ({
      Component: MonitorLayout,
    }),
  );

const dependencyDiagnosticsSectionLayout = () =>
  import(
    /* webpackChunkName: "monitor" */ "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsSectionLayout"
  ).then(({ DependencyDiagnosticsSectionLayout }) => ({
    Component: DependencyDiagnosticsSectionLayout,
  }));

const dependencyDiagnosticsUpsellPage = () =>
  import(
    /* webpackChunkName: "monitor" */ "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsUpsellPage"
  ).then(({ DependencyDiagnosticsUpsellPage }) => ({
    Component: DependencyDiagnosticsUpsellPage,
  }));

const jobInfoApp = () =>
  import(
    /* webpackChunkName: "monitor" */ "metabase/monitor/tools/components/JobInfoApp"
  ).then(({ JobInfoApp }) => ({ Component: JobInfoApp }));

const logs = () =>
  import(
    /* webpackChunkName: "monitor" */ "metabase/monitor/tools/components/Logs"
  ).then(({ Logs }) => ({
    Component: Logs,
  }));

const modelPersistenceLogPage = () =>
  import(
    /* webpackChunkName: "monitor" */ "metabase/monitor/tools/components/ModelPersistenceLogJobs/ModelPersistenceLogJobs"
  ).then(({ ModelPersistenceLogPage }) => ({
    Component: ModelPersistenceLogPage,
  }));

// The log levels modal renders a code editor, which nothing else on the logs
// page needs. Its parent route is already lazy, but a modal declared with
// `modalRoute` holds its component eagerly.
const logLevelsModal = () =>
  Promise.all([
    import(
      /* webpackChunkName: "monitor" */ "metabase/monitor/tools/components/LogLevelsModal"
    ),
    // Awaited here so the modal appears with its editor already in place,
    // rather than opening around an empty area that fills in a moment later.
    loadCodeEditor(),
  ]).then(([{ LogLevelsModal }]) => LogLevelsModal);

export function getMonitorRoutes() {
  return (
    <Route element={<CanAccessMonitor />}>
      <Route path="monitor" lazy={monitorLayout}>
        <Route index element={<MonitorIndexRedirect />} />
        <Route element={<CanAccessMonitorDiagnostics />}>
          {PLUGIN_MONITOR.isDependencyDiagnosticsEnabled ? (
            <Route
              path="dependency-diagnostics"
              lazy={dependencyDiagnosticsSectionLayout}
            >
              {PLUGIN_MONITOR.getDependencyDiagnosticsRoutes()}
            </Route>
          ) : (
            <Route path="dependency-diagnostics">
              <Route index lazy={dependencyDiagnosticsUpsellPage} />
              <Route path="*" lazy={dependencyDiagnosticsUpsellPage} />
            </Route>
          )}
        </Route>

        <Route element={<CanAccessMonitoringTools />}>
          <Route path="tasks">{getTasksRoutes()}</Route>
          <Route path="jobs" lazy={jobInfoApp}>
            <Route path=":jobKey" />
          </Route>
          <Route path="logs" lazy={logs}>
            {lazyModalRouteElement("levels", logLevelsModal)}
          </Route>
          <Route
            path="errors"
            element={createElement(
              PLUGIN_MONITOR_TOOLS.COMPONENT || MonitorUpsell,
            )}
          />
          <Route path="model-persistence-log" lazy={modelPersistenceLogPage}>
            {modalRoute(":jobId", ModelPersistenceLogJobModal)}
          </Route>
        </Route>

        <Route element={<CanAccessAlertsManagement />}>
          <Route path="notifications">{getNotificationsRoutes()}</Route>
        </Route>

        <Route element={<CanAccessAiAuditing />}>
          {PLUGIN_AUDIT.isAiAuditingEnabled && (
            <Route path="ai-auditing">
              {PLUGIN_AUDIT.getAiAuditingRoutes()}
            </Route>
          )}
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
 * Legacy redirects for pages that moved into the Monitor area:
 *   - /admin/tools → /monitor
 *   - /admin/tools/help → /admin/help
 *   - /admin/metabot/usage-auditing → /monitor/ai-auditing/usage
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
        element={redirect(Urls.monitorModelPersistenceLog())}
      />
      <Route
        path="/admin/tools/model-caching/*"
        element={redirect(`${Urls.monitorModelPersistenceLog()}/*`)}
      />
      <Route
        path="/admin/tools/notifications"
        element={redirect(Urls.monitorNotifications())}
      />
      <Route
        path="/admin/tools/notifications/*"
        element={redirect(`${Urls.monitorNotifications()}/*`)}
      />
      <Route
        path="/admin/metabot/usage-auditing"
        element={redirect(Urls.monitorAiAuditingUsage())}
      />
      <Route
        path="/admin/metabot/usage-auditing/conversations"
        element={redirect(Urls.monitorAiAuditingConversations())}
      />
      <Route
        path="/admin/metabot/usage-auditing/conversations/*"
        element={redirect(`${Urls.monitorAiAuditingConversations()}/*`)}
      />
      <Route
        path="/admin/metabot/usage-auditing/mcp"
        element={redirect(Urls.monitorAiAuditingMcp())}
      />
      <Route
        path="/admin/metabot/usage-auditing/cli"
        element={redirect(Urls.monitorAiAuditingCli())}
      />
      <Route path="/admin/tools" element={redirect(Urls.monitor())} />
    </>
  );
}
