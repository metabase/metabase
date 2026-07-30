import {
  canAccessAlertsManagement,
  canAccessMonitor,
  canAccessMonitorDiagnostics,
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

const UserCanAccessMonitorDiagnostics = createRedirectGuard(
  (state) => canAccessMonitorDiagnostics(state),
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

export const CanAccessMonitor = () => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserCanAccessMonitor>
        <Outlet />
      </UserCanAccessMonitor>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);

export const CanAccessMonitorDiagnostics = () => (
  <UserCanAccessMonitorDiagnostics>
    <Outlet />
  </UserCanAccessMonitorDiagnostics>
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
