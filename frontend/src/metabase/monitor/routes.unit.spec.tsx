import type { ReactNode } from "react";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { getStore, mainReducers } from "__support__/entities-store";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import { getMonitorRedirects, getMonitorRoutes } from "./routes";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn().mockReturnValue(true),
}));

jest.mock("./components/MonitorLayout", () => ({
  MonitorLayout: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
jest.mock(
  "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsSectionLayout",
  () => ({
    DependencyDiagnosticsSectionLayout: ({
      children,
    }: {
      children?: ReactNode;
    }) => <div data-testid="diagnostics-section">{children}</div>,
  }),
);

jest.mock("metabase-enterprise/monitor/dependency-diagnostics/pages", () => ({
  BrokenDependencyDiagnosticsPage: () => <div>{"Broken page"}</div>,
  UnreferencedDependencyDiagnosticsPage: () => <div>{"Unreferenced page"}</div>,
}));

// Stub the migrated Admin Tools pages so this stays a focused routing test —
// the sections/redirects under test don't depend on their data-fetching.
jest.mock("metabase/monitor/tools/components/Logs", () => ({
  Logs: ({ children }: { children?: ReactNode }) => (
    <div data-testid="logs-page">
      {"Logs"}
      {children}
    </div>
  ),
}));
jest.mock("metabase/monitor/tools/components/JobInfoApp", () => ({
  JobInfoApp: () => <div data-testid="jobs-page">{"Jobs"}</div>,
}));
jest.mock("metabase/monitor/tools/components/ModelCacheRefreshJobs", () => ({
  ModelCachePage: () => (
    <div data-testid="model-caching-page">{"Model cache log"}</div>
  ),
  ModelCacheRefreshJobModal: () => null,
}));
jest.mock("metabase/monitor/tools/components/JobTriggersModal", () => ({
  JobTriggersModal: () => null,
}));
jest.mock("metabase/monitor/tools/components/LogLevelsModal", () => ({
  LogLevelsModal: () => null,
}));
jest.mock("metabase/monitor/tools/components/ToolsUpsell", () => ({
  ToolsUpsell: () => (
    <div data-testid="errors-upsell">{"Erroring questions"}</div>
  ),
}));

// Stub the Tasks/Notifications leaf pages (not the route factories) so the real
// route mounting + index redirects in getTasksRoutes/getNotificationsRoutes are
// exercised without their data-fetching plumbing.
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

const CanAccessMonitor = ({ children }: { children?: ReactNode }) => (
  <>{children}</>
);

const CanAccessMonitorDiagnostics = ({
  children,
}: {
  children?: ReactNode;
}) => <>{children}</>;

const CanAccessMonitoringTools = ({ children }: { children?: ReactNode }) => (
  <>{children}</>
);

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
  // The index route reads state on entry to pick the landing section.
  const store = getStore(mainReducers, createMockState({ currentUser: user }));

  renderWithProviders(
    <Route path="/">
      {getMonitorRedirects()}
      {getMonitorRoutes(
        store,
        CanAccessMonitor,
        CanAccessMonitorDiagnostics,
        CanAccessMonitoringTools,
      )}
    </Route>,
    { withRouter: true, initialRoute },
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
  });

  describe("getMonitorRedirects (legacy Data Studio URLs)", () => {
    it("redirects the old base URL into the Monitor area", async () => {
      setup({ initialRoute: "/data-studio/dependency-diagnostics" });

      expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
    });

    it("redirects old child URLs (e.g. /broken) to the Monitor equivalent", async () => {
      setup({ initialRoute: "/data-studio/dependency-diagnostics/broken" });

      expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
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

    it("renders the Model cache log section at /monitor/model-caching", async () => {
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
  });
});
