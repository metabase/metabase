import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { lazyLoaders } from "__support__/lazy-routes";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { PLUGIN_AUDIT, reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { createMockUser } from "metabase-types/api/mocks";

import { getMonitorRedirects, getMonitorRoutes } from "./routes";

type MonitorGuard =
  | "CanAccessMonitor"
  | "CanAccessDependencyDiagnostics"
  | "CanAccessContentDiagnostics"
  | "CanAccessMonitoringTools"
  | "CanAccessAlertsManagement"
  | "CanAccessAiAuditing";

/**
 * These specs assert route-tree structure, not access policy, so the guards are
 * stubbed to allow by default. Adding a guard here makes it deny instead, which
 * is how a single section gets blocked without touching permissions state.
 */
const mockDeniedGuards = new Set<MonitorGuard>();

jest.mock("./route-guards", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  const stubGuard = (name: MonitorGuard) => {
    const Guard = () =>
      mockDeniedGuards.has(name) ? (
        <div data-testid="unauthorized-marker">{"Unauthorized"}</div>
      ) : (
        <Outlet />
      );
    return Guard;
  };

  return {
    CanAccessMonitor: stubGuard("CanAccessMonitor"),
    CanAccessDependencyDiagnostics: stubGuard("CanAccessDependencyDiagnostics"),
    CanAccessContentDiagnostics: stubGuard("CanAccessContentDiagnostics"),
    CanAccessMonitoringTools: stubGuard("CanAccessMonitoringTools"),
    CanAccessAlertsManagement: stubGuard("CanAccessAlertsManagement"),
    CanAccessAiAuditing: stubGuard("CanAccessAiAuditing"),
  };
});

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
jest.mock(
  "metabase/monitor/content-diagnostics/ContentDiagnosticsSectionLayout",
  () => {
    const { Outlet } = jest.requireActual("metabase/router");
    return {
      ContentDiagnosticsSectionLayout: () => (
        <div data-testid="content-diagnostics-section">
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
jest.mock("metabase-enterprise/monitor/content-diagnostics/pages", () => ({
  StaleContentPage: () => <div>{"Stale content page"}</div>,
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
jest.mock(
  "metabase/monitor/tools/components/ModelPersistenceLogJobs/ModelPersistenceLogJobs",
  () => ({
    ModelPersistenceLogPage: () => (
      <div data-testid="model-persistence-log-page">
        {"Model persistence log"}
      </div>
    ),
  }),
);
jest.mock(
  "metabase/monitor/tools/components/ModelPersistenceLogJobs/ModelPersistenceLogJobModal",
  () => ({ ModelPersistenceLogJobModal: () => null }),
);
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

const UPSELL_TITLE =
  "Find and fix broken dependencies without hunting them down";
const CONTENT_DIAGNOSTICS_UPSELL_TITLE =
  "Find and clean up stale content without hunting it down";

type SetupOpts = {
  initialRoute: string;
  user?: ReturnType<typeof createMockUser>;
  /** Guards to make deny access, so a section can be blocked in isolation. */
  deny?: MonitorGuard[];
};

const setup = ({
  initialRoute,
  user = createMockUser({ is_superuser: true }),
  deny = [],
}: SetupOpts) => {
  deny.forEach((guard) => mockDeniedGuards.add(guard));

  return renderWithProviders(
    <Route path="/">
      {getMonitorRedirects()}
      {getMonitorRoutes()}
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({ currentUser: user }),
    },
  );
};

const enableAiAuditingRoutes = () => {
  PLUGIN_AUDIT.isAiAuditingEnabled = true;
  PLUGIN_AUDIT.getAiAuditingRoutes = () => (
    <Route
      path="usage"
      element={<div data-testid="ai-auditing-page">AI Auditing</div>}
    />
  );
};

describe("monitor routes", () => {
  afterEach(() => {
    reinitialize();
    mockDeniedGuards.clear();
  });

  // Route factories name their page in an `import()`, so nothing type-checks the
  // path or the export. Resolving every lazy loader is the cheap guard against a
  // typo that would otherwise surface as a blank page. Runs against default (OSS)
  // plugin state, so both diagnostics sections are on their upsell branch.
  it("resolves every lazy page", async () => {
    const loaders = lazyLoaders(getMonitorRoutes());

    expect(loaders).toHaveLength(15);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
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

    describe("OSS (Content Diagnostics disabled)", () => {
      it("renders the upsell for content diagnostics child paths", async () => {
        setup({ initialRoute: "/monitor/content-diagnostics/stale" });

        expect(
          await screen.findByText(CONTENT_DIAGNOSTICS_UPSELL_TITLE),
        ).toBeInTheDocument();
        expect(
          screen.queryByTestId("content-diagnostics-section"),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText("Stale content page"),
        ).not.toBeInTheDocument();
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

    describe("EE (Content Diagnostics enabled)", () => {
      it("renders the content diagnostics section and child routes instead of the upsell", async () => {
        setupEnterpriseOnlyPlugin("monitor_content_diagnostics");

        setup({ initialRoute: "/monitor/content-diagnostics/stale" });

        expect(
          await screen.findByTestId("content-diagnostics-section"),
        ).toBeInTheDocument();
        expect(screen.getByText("Stale content page")).toBeInTheDocument();
        expect(
          screen.queryByText(CONTENT_DIAGNOSTICS_UPSELL_TITLE),
        ).not.toBeInTheDocument();
      });

      it("redirects the content diagnostics index to the stale route", async () => {
        setupEnterpriseOnlyPlugin("monitor_content_diagnostics");

        setup({ initialRoute: "/monitor/content-diagnostics" });

        expect(
          await screen.findByText("Stale content page"),
        ).toBeInTheDocument();
      });
    });

    describe("index redirect (/monitor)", () => {
      it("sends analysts to dependency diagnostics", async () => {
        const { router } = setup({
          initialRoute: "/monitor",
          user: createMockUser({
            is_superuser: false,
            is_data_analyst: true,
          }),
        });

        await waitFor(() =>
          expect(router?.location.pathname).toBe(
            "/monitor/dependency-diagnostics",
          ),
        );
      });

      it("sends monitoring-only users to content diagnostics", async () => {
        const { router } = setup({
          initialRoute: "/monitor",
          user: createMockUser({
            is_superuser: false,
            is_data_analyst: false,
            permissions: { can_access_monitoring: true },
          }),
        });

        await waitFor(() =>
          expect(router?.location.pathname).toBe(
            "/monitor/content-diagnostics",
          ),
        );
      });
    });

    describe("unknown routes", () => {
      it("renders the NotFound page inside the Monitor layout", async () => {
        setup({ initialRoute: "/monitor/does-not-exist" });

        expect(await screen.findByLabelText("error page")).toBeInTheDocument();
      });

      it("blocks section routes when the section guard denies", async () => {
        setup({
          initialRoute: "/monitor/logs",
          deny: ["CanAccessMonitoringTools"],
        });

        expect(
          await screen.findByTestId("unauthorized-marker"),
        ).toBeInTheDocument();
        expect(screen.queryByTestId("logs-page")).not.toBeInTheDocument();
      });

      it("blocks the notifications route when its own guard denies, independent of the Tools guard", async () => {
        setup({
          initialRoute: "/monitor/notifications",
          deny: ["CanAccessAlertsManagement"],
        });

        expect(
          await screen.findByTestId("unauthorized-marker"),
        ).toBeInTheDocument();
        expect(
          screen.queryByTestId("notifications-page"),
        ).not.toBeInTheDocument();
      });

      it("blocks the AI Auditing route when its own guard denies", async () => {
        enableAiAuditingRoutes();

        setup({
          initialRoute: Urls.monitorAiAuditingUsage(),
          deny: ["CanAccessAiAuditing"],
        });

        expect(
          await screen.findByTestId("unauthorized-marker"),
        ).toBeInTheDocument();
        expect(
          screen.queryByTestId("ai-auditing-page"),
        ).not.toBeInTheDocument();
      });

      it("renders NotFound for unknown paths even when every section guard denies (catch-all sits outside the guards)", async () => {
        setup({
          initialRoute: "/monitor/does-not-exist",
          deny: [
            "CanAccessDependencyDiagnostics",
            "CanAccessContentDiagnostics",
            "CanAccessMonitoringTools",
          ],
        });

        expect(await screen.findByLabelText("error page")).toBeInTheDocument();
        expect(
          screen.queryByTestId("unauthorized-marker"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Tools sections (migrated from /admin/tools)", () => {
    it.each([["/monitor/logs"], ["/monitor/logs/levels"]])(
      "renders the Logs section at %s",
      async (initialRoute) => {
        setup({ initialRoute });

        expect(await screen.findByTestId("logs-page")).toBeInTheDocument();
      },
    );

    it.each([["/monitor/jobs"], ["/monitor/jobs/sync"]])(
      "renders the Jobs section at %s",
      async (initialRoute) => {
        setup({ initialRoute });

        expect(await screen.findByTestId("jobs-page")).toBeInTheDocument();
      },
    );

    it.each([
      ["/monitor/model-persistence-log"],
      ["/monitor/model-persistence-log/9"],
    ])(
      "renders the Model persistence log section at %s",
      async (initialRoute) => {
        setup({ initialRoute });

        expect(
          await screen.findByTestId("model-persistence-log-page"),
        ).toBeInTheDocument();
      },
    );

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
      ["/admin/tools/model-caching", "model-persistence-log-page"],
      ["/admin/tools/model-caching/9", "model-persistence-log-page"],
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
