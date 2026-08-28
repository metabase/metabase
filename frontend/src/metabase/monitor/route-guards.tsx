import {
  canAccessAiAuditing,
  canAccessAlertsManagement,
  canAccessContentDiagnostics,
  canAccessDependencyDiagnostics,
  canAccessMonitor,
  canAccessMonitoringTools,
} from "metabase/common/monitor/selectors";
import {
  MetabaseIsSetup,
  UserIsAuthenticated,
  createRedirectGuard,
} from "metabase/route-guards";
import { Outlet } from "metabase/router";

const UserCanAccessMonitor = createRedirectGuard(
  (state) => canAccessMonitor(state),
  "/unauthorized",
);

const UserCanAccessDependencyDiagnostics = createRedirectGuard(
  (state) => canAccessDependencyDiagnostics(state),
  "/unauthorized",
);

const UserCanAccessContentDiagnostics = createRedirectGuard(
  (state) => canAccessContentDiagnostics(state),
  "/unauthorized",
);

const UserCanAccessMonitoringTools = createRedirectGuard(
  (state) => canAccessMonitoringTools(state),
  "/unauthorized",
);

const UserCanAccessAlertsManagement = createRedirectGuard(
  (state) => canAccessAlertsManagement(state),
  "/unauthorized",
);

const UserCanAccessAiAuditing = createRedirectGuard(
  (state) => canAccessAiAuditing(state),
  "/unauthorized",
);

export const CanAccessMonitor = () => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserCanAccessMonitor>
        <Outlet />
      </UserCanAccessMonitor>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);

export const CanAccessDependencyDiagnostics = () => (
  <UserCanAccessDependencyDiagnostics>
    <Outlet />
  </UserCanAccessDependencyDiagnostics>
);

export const CanAccessContentDiagnostics = () => (
  <UserCanAccessContentDiagnostics>
    <Outlet />
  </UserCanAccessContentDiagnostics>
);

export const CanAccessMonitoringTools = () => (
  <UserCanAccessMonitoringTools>
    <Outlet />
  </UserCanAccessMonitoringTools>
);

export const CanAccessAlertsManagement = () => (
  <UserCanAccessAlertsManagement>
    <Outlet />
  </UserCanAccessAlertsManagement>
);

export const CanAccessAiAuditing = () => (
  <UserCanAccessAiAuditing>
    <Outlet />
  </UserCanAccessAiAuditing>
);
