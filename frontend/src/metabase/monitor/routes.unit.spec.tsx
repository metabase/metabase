import type { ReactNode } from "react";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";

import { getMonitorRedirects, getMonitorRoutes } from "./routes";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn().mockReturnValue(true),
}));

// Keep this a focused routing test: stub the space/section layouts to pass
// children through, so we don't have to wire up their user-key-value/settings
// endpoints. The routing under test (redirects, upsell vs. diagnostics) is what
// we assert.
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

jest.mock(
  "metabase/monitor/content-diagnostics/ContentDiagnosticsSectionLayout",
  () => ({
    ContentDiagnosticsSectionLayout: ({
      children,
    }: {
      children?: ReactNode;
    }) => <div data-testid="content-diagnostics-section">{children}</div>,
  }),
);

jest.mock("metabase-enterprise/monitor/content-diagnostics/pages", () => ({
  StaleContentPage: () => <div>{"Stale page"}</div>,
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

const CanAccessMonitoringTools = ({ children }: { children?: ReactNode }) => (
  <>{children}</>
);

const UPSELL_TITLE =
  "Find and fix broken dependencies without hunting them down";

const CONTENT_UPSELL_TITLE =
  "Find and clean up stale content without hunting it down";

// Render the real Monitor route tree together with the real legacy redirects, so
// an old `/data-studio/...` URL is resolved by the actual definitions — not a
// copy of them.
const setup = (initialRoute: string) => {
  renderWithProviders(
    <Route path="/">
      {getMonitorRedirects()}
      {getMonitorRoutes(CanAccessMonitor, CanAccessMonitoringTools)}
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
        setup("/monitor/dependency-diagnostics");

        expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
        expect(
          screen.queryByTestId("diagnostics-section"),
        ).not.toBeInTheDocument();
      });

      it("renders the upsell for child paths (e.g. /broken)", async () => {
        setup("/monitor/dependency-diagnostics/broken");

        expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
        expect(screen.queryByText("Broken page")).not.toBeInTheDocument();
      });
    });

    describe("EE (Dependency Diagnostics enabled)", () => {
      it("renders the diagnostics section and child routes instead of the upsell", async () => {
        setupEnterpriseOnlyPlugin("monitor_dependency_diagnostics");

        setup("/monitor/dependency-diagnostics/broken");

        expect(
          await screen.findByTestId("diagnostics-section"),
        ).toBeInTheDocument();
        expect(screen.getByText("Broken page")).toBeInTheDocument();
        expect(screen.queryByText(UPSELL_TITLE)).not.toBeInTheDocument();
      });

      it("redirects the diagnostics index to the broken route", async () => {
        setupEnterpriseOnlyPlugin("monitor_dependency_diagnostics");

        setup("/monitor/dependency-diagnostics");

        expect(await screen.findByText("Broken page")).toBeInTheDocument();
      });
    });

    describe("Content diagnostics — OSS (disabled)", () => {
      it("renders the upsell at /monitor/content-diagnostics", async () => {
        setup("/monitor/content-diagnostics");

        expect(
          await screen.findByText(CONTENT_UPSELL_TITLE),
        ).toBeInTheDocument();
        expect(
          screen.queryByTestId("content-diagnostics-section"),
        ).not.toBeInTheDocument();
      });

      it("renders the upsell for child paths (e.g. /stale)", async () => {
        setup("/monitor/content-diagnostics/stale");

        expect(
          await screen.findByText(CONTENT_UPSELL_TITLE),
        ).toBeInTheDocument();
        expect(screen.queryByText("Stale page")).not.toBeInTheDocument();
      });
    });

    describe("Content diagnostics — EE (enabled)", () => {
      it("renders the section and stale child route instead of the upsell", async () => {
        setupEnterpriseOnlyPlugin("monitor_content_diagnostics");

        setup("/monitor/content-diagnostics/stale");

        expect(
          await screen.findByTestId("content-diagnostics-section"),
        ).toBeInTheDocument();
        expect(screen.getByText("Stale page")).toBeInTheDocument();
        expect(
          screen.queryByText(CONTENT_UPSELL_TITLE),
        ).not.toBeInTheDocument();
      });

      it("redirects the content diagnostics index to the stale route", async () => {
        setupEnterpriseOnlyPlugin("monitor_content_diagnostics");

        setup("/monitor/content-diagnostics");

        expect(await screen.findByText("Stale page")).toBeInTheDocument();
      });
    });
  });

  describe("getMonitorRedirects (legacy Data Studio URLs)", () => {
    it("redirects the old base URL into the Monitor area", async () => {
      setup("/data-studio/dependency-diagnostics");

      expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
    });

    it("redirects old child URLs (e.g. /broken) to the Monitor equivalent", async () => {
      setup("/data-studio/dependency-diagnostics/broken");

      expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
    });
  });

  describe("Tools sections (migrated from /admin/tools)", () => {
    it("renders the Logs section at /monitor/logs", async () => {
      setup("/monitor/logs");

      expect(await screen.findByTestId("logs-page")).toBeInTheDocument();
    });

    it("renders the Jobs section at /monitor/jobs", async () => {
      setup("/monitor/jobs");

      expect(await screen.findByTestId("jobs-page")).toBeInTheDocument();
    });

    it("renders the Model cache log section at /monitor/model-caching", async () => {
      setup("/monitor/model-caching");

      expect(
        await screen.findByTestId("model-caching-page"),
      ).toBeInTheDocument();
    });

    it("renders the Erroring questions upsell at /monitor/errors without the audit_app feature", async () => {
      setup("/monitor/errors");

      expect(await screen.findByTestId("errors-upsell")).toBeInTheDocument();
    });
  });

  // The Tasks/Notifications sections mount real route factories with index
  // redirects and nested params, so exercise those boundaries directly.
  describe("Tasks section route branches", () => {
    it.each([
      ["/monitor/tasks", "task-list-page"],
      ["/monitor/tasks/list", "task-list-page"],
      ["/monitor/tasks/list/42", "task-details-page"],
      ["/monitor/tasks/runs", "task-runs-page"],
      ["/monitor/tasks/runs/7", "task-run-details-page"],
    ])("mounts %s", async (route, testId) => {
      setup(route);

      expect(await screen.findByTestId(testId)).toBeInTheDocument();
    });
  });

  describe("Notifications section route branches", () => {
    it.each([["/monitor/notifications"], ["/monitor/notifications/13"]])(
      "mounts %s",
      async (route) => {
        setup(route);

        expect(
          await screen.findByTestId("notifications-page"),
        ).toBeInTheDocument();
      },
    );
  });

  // Each redirect declared in getMonitorRedirects should reach its destination.
  // A typo or ordering issue in any single Redirect would otherwise ship unnoticed.
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
      setup(route);

      expect(await screen.findByTestId(testId)).toBeInTheDocument();
    });
  });
});
