import type { ReactNode } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import { getMonitorRedirects, getMonitorRoutes } from "./routes";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn().mockReturnValue(true),
}));

jest.mock("./components/MonitorLayout", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return { MonitorLayout: () => <Outlet /> };
});
jest.mock(
  "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsSectionLayout",
  () => {
    const { Outlet } = jest.requireActual("metabase/router");
    return {
      DependencyDiagnosticsSectionLayout: () => (
        <div data-testid="diagnostics-section">
          <Outlet />
        </div>
      ),
    };
  },
);

jest.mock("metabase-enterprise/monitor/dependency-diagnostics/pages", () => ({
  BrokenDependencyDiagnosticsPage: () => <div>{"Broken page"}</div>,
  UnreferencedDependencyDiagnosticsPage: () => <div>{"Unreferenced page"}</div>,
}));

jest.mock("metabase/monitor/tools/components/Logs", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return {
    Logs: () => (
      <div data-testid="logs-page">
        {"Logs"}
        <Outlet />
      </div>
    ),
  };
});
jest.mock("metabase/monitor/tools/components/JobInfoApp", () => ({
  JobInfoApp: () => <div data-testid="jobs-page">{"Jobs"}</div>,
}));
jest.mock("metabase/monitor/tools/components/ModelCacheRefreshJobs", () => ({
  ModelCachePage: () => (
    <div data-testid="model-caching-page">{"Model caching log"}</div>
  ),
  ModelCacheRefreshJobModal: () => null,
}));
jest.mock("metabase/monitor/tools/components/LogLevelsModal", () => ({
  LogLevelsModal: () => null,
}));
jest.mock("metabase/monitor/tools/components/MonitorUpsell", () => ({
  MonitorUpsell: () => (
    <div data-testid="errors-upsell">{"Erroring questions"}</div>
  ),
}));

jest.mock("metabase/monitor/tools/components/TaskListPage", () => ({
  TaskListPage: () => <div data-testid="task-list-page">{"Task list"}</div>,
}));
jest.mock("metabase/monitor/tools/components/TaskDetailsPage", () => ({
  TaskDetailsPage: () => (
    <div data-testid="task-details-page">{"Task details"}</div>
  ),
}));
jest.mock("metabase/monitor/tools/components/TaskRunsPage", () => ({
  TaskRunsPage: () => <div data-testid="task-runs-page">{"Task runs"}</div>,
}));
jest.mock("metabase/monitor/tools/components/TaskRunDetailsPage", () => ({
  TaskRunDetailsPage: () => (
    <div data-testid="task-run-details-page">{"Task run details"}</div>
  ),
}));
jest.mock(
  "metabase/monitor/tools/notifications/NotificationsAdminPage",
  () => ({
    NotificationsAdminPage: () => (
      <div data-testid="notifications-page">{"Notifications"}</div>
    ),
  }),
);

const CanAccessMonitor = () => <Outlet />;
const CanAccessMonitorDiagnostics = () => <Outlet />;
const CanAccessMonitoringTools = () => <Outlet />;
const CanAccessAlertsManagement = () => <Outlet />;

const UPSELL_TITLE =
  "Find and fix broken dependencies without hunting them down";

type SetupOpts = {
  initialRoute: string;
  user?: ReturnType<typeof createMockUser>;
};

const setup = ({
  initialRoute,
  user = createMockUser({ is_superuser: true }),
}: SetupOpts) => {
  return renderWithProviders(
    <Route path="/">
      {getMonitorRedirects()}
      {getMonitorRoutes(
        CanAccessMonitor,
        CanAccessMonitorDiagnostics,
        CanAccessMonitoringTools,
        CanAccessAlertsManagement,
      )}
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({ currentUser: user }),
    },
  );
};

const DenyingGuard = () => (
  <div data-testid="unauthorized-marker">{"Unauthorized"}</div>
);

const setupWithGuards = ({
  initialRoute,
  CanAccessMonitorDiagnostics: Diagnostics = CanAccessMonitorDiagnostics,
  CanAccessMonitoringTools: Tools = CanAccessMonitoringTools,
  CanAccessAlertsManagement: AlertsManagement = CanAccessAlertsManagement,
}: {
  initialRoute: string;
  CanAccessMonitorDiagnostics?: () => ReactNode;
  CanAccessMonitoringTools?: () => ReactNode;
  CanAccessAlertsManagement?: () => ReactNode;
}) => {
  return renderWithProviders(
    <Route path="/">
      {getMonitorRedirects()}
      {getMonitorRoutes(CanAccessMonitor, Diagnostics, Tools, AlertsManagement)}
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
};

describe("monitor routes", () => {
  afterEach(() => {
    reinitialize();
  });

  describe("getMonitorRoutes", () => {
    describe("OSS (Dependency Diagnostics disabled)", () => {
      it("renders the upsell at /monitor/dependency-diagnostics", async () => {
        setup({ initialRoute: "/monitor/dependency-diagnostics" });

        expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
        expect(
          screen.queryByTestId("diagnostics-section"),
        ).not.toBeInTheDocument();
      });

      it("renders the upsell for child paths (e.g. /broken)", async () => {
        setup({ initialRoute: "/monitor/dependency-diagnostics/broken" });

        expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
        expect(screen.queryByText("Broken page")).not.toBeInTheDocument();
      });
    });

    describe("EE (Dependency Diagnostics enabled)", () => {
      it("renders the diagnostics section and child routes instead of the upsell", async () => {
        setupEnterpriseOnlyPlugin("monitor_dependency_diagnostics");

        setup({ initialRoute: "/monitor/dependency-diagnostics/broken" });

        expect(
          await screen.findByTestId("diagnostics-section"),
        ).toBeInTheDocument();
        expect(screen.getByText("Broken page")).toBeInTheDocument();
        expect(screen.queryByText(UPSELL_TITLE)).not.toBeInTheDocument();
      });

      it("redirects the diagnostics index to the broken route", async () => {
        setupEnterpriseOnlyPlugin("monitor_dependency_diagnostics");

        setup({ initialRoute: "/monitor/dependency-diagnostics" });

        expect(await screen.findByText("Broken page")).toBeInTheDocument();
      });
    });

    describe("index redirect (/monitor)", () => {
      it("sends analysts to the diagnostics section", async () => {
        setup({
          initialRoute: "/monitor",
          user: createMockUser({
            is_superuser: false,
            is_data_analyst: true,
          }),
        });

        expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
      });

      it("sends monitoring-only users to the Tools pages", async () => {
        setup({
          initialRoute: "/monitor",
          user: createMockUser({
            is_superuser: false,
            is_data_analyst: false,
            permissions: { can_access_monitoring: true },
          }),
        });

        expect(await screen.findByTestId("task-list-page")).toBeInTheDocument();
      });
    });

    describe("unknown routes", () => {
      it("renders the NotFound page inside the Monitor layout", async () => {
        setup({ initialRoute: "/monitor/does-not-exist" });

        expect(await screen.findByLabelText("error page")).toBeInTheDocument();
      });

      it("blocks section routes when the section guard denies", async () => {
        setupWithGuards({
          initialRoute: "/monitor/logs",
          CanAccessMonitoringTools: DenyingGuard,
        });

        expect(
          await screen.findByTestId("unauthorized-marker"),
        ).toBeInTheDocument();
        expect(screen.queryByTestId("logs-page")).not.toBeInTheDocument();
      });

      it("blocks the notifications route when its own guard denies, independent of the Tools guard", async () => {
        setupWithGuards({
          initialRoute: "/monitor/notifications",
          CanAccessAlertsManagement: DenyingGuard,
        });

        expect(
          await screen.findByTestId("unauthorized-marker"),
        ).toBeInTheDocument();
        expect(
          screen.queryByTestId("notifications-page"),
        ).not.toBeInTheDocument();
      });

      it("renders NotFound for unknown paths even when both section guards deny (catch-all sits outside the guards)", async () => {
        setupWithGuards({
          initialRoute: "/monitor/does-not-exist",
          CanAccessMonitorDiagnostics: DenyingGuard,
          CanAccessMonitoringTools: DenyingGuard,
        });

        expect(await screen.findByLabelText("error page")).toBeInTheDocument();
        expect(
          screen.queryByTestId("unauthorized-marker"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Tools sections (migrated from /admin/tools)", () => {
    it("renders the Logs section at /monitor/logs", async () => {
      setup({ initialRoute: "/monitor/logs" });

      expect(await screen.findByTestId("logs-page")).toBeInTheDocument();
    });

    it("renders the Jobs section at /monitor/jobs", async () => {
      setup({ initialRoute: "/monitor/jobs" });

      expect(await screen.findByTestId("jobs-page")).toBeInTheDocument();
    });

    it("renders the Model caching log section at /monitor/model-caching", async () => {
      setup({ initialRoute: "/monitor/model-caching" });

      expect(
        await screen.findByTestId("model-caching-page"),
      ).toBeInTheDocument();
    });

    it("renders the Erroring questions upsell at /monitor/errors without the audit_app feature", async () => {
      setup({ initialRoute: "/monitor/errors" });

      expect(await screen.findByTestId("errors-upsell")).toBeInTheDocument();
    });
  });

  describe("Tasks section route branches", () => {
    it.each([
      ["/monitor/tasks", "task-list-page"],
      ["/monitor/tasks/list", "task-list-page"],
      ["/monitor/tasks/list/42", "task-details-page"],
      ["/monitor/tasks/runs", "task-runs-page"],
      ["/monitor/tasks/runs/7", "task-run-details-page"],
    ])("mounts %s", async (route, testId) => {
      setup({ initialRoute: route });

      expect(await screen.findByTestId(testId)).toBeInTheDocument();
    });
  });

  describe("Notifications section route branches", () => {
    it.each([["/monitor/notifications"], ["/monitor/notifications/13"]])(
      "mounts %s",
      async (route) => {
        setup({ initialRoute: route });

        expect(
          await screen.findByTestId("notifications-page"),
        ).toBeInTheDocument();
      },
    );
  });

  describe("getMonitorRedirects (legacy Admin Tools URLs)", () => {
    it.each([
      ["/admin/tools/tasks", "task-list-page"],
      ["/admin/tools/tasks/list", "task-list-page"],
      ["/admin/tools/tasks/list/42", "task-details-page"],
      ["/admin/tools/tasks/runs", "task-runs-page"],
      ["/admin/tools/tasks/runs/7", "task-run-details-page"],
      ["/admin/tools/jobs", "jobs-page"],
      ["/admin/tools/jobs/sync", "jobs-page"],
      ["/admin/tools/logs", "logs-page"],
      ["/admin/tools/logs/levels", "logs-page"],
      ["/admin/tools/errors", "errors-upsell"],
      ["/admin/tools/model-caching", "model-caching-page"],
      ["/admin/tools/model-caching/9", "model-caching-page"],
      ["/admin/tools/notifications", "notifications-page"],
      ["/admin/tools/notifications/13", "notifications-page"],
    ])("redirects %s into the Monitor space", async (route, testId) => {
      setup({ initialRoute: route });

      expect(await screen.findByTestId(testId)).toBeInTheDocument();
    });

    it("redirects the legacy /admin/tools index into the Monitor space", async () => {
      setup({ initialRoute: "/admin/tools" });

      expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
    });
  });
});
