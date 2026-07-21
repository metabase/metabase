import userEvent from "@testing-library/user-event";
import { type ReactNode, memo, useState } from "react";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import {
  createMockLocation,
  createMockRoutingState,
  createMockState,
} from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { MonitorLayout } from "./MonitorLayout";
import { Sidebar } from "./Sidebar";

jest.mock("metabase/common/monitor/analytics", () => ({
  trackMonitorSectionClicked: jest.fn(),
}));

const { trackMonitorSectionClicked } = jest.requireMock(
  "metabase/common/monitor/analytics",
);

interface SetupOpts {
  isNavbarOpened?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  mcpEnabled?: boolean;
  initialRoute?: string;
  user?: ReturnType<typeof createMockUser>;
  children?: ReactNode;
}

function TestSidebarSetter() {
  return (
    <>
      <div data-testid="content">{"Content"}</div>
      <Sidebar containerWidth={1000}>
        <aside data-testid="monitor-sidebar">{"Sidebar"}</aside>
      </Sidebar>
    </>
  );
}

const TestMainContent = memo(function TestMainContent({
  onRender,
}: {
  onRender: () => void;
}) {
  onRender();

  return <div data-testid="content">{"Content"}</div>;
});

function TestSidebarToggle({ onRender }: { onRender: () => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <TestMainContent onRender={onRender} />
      <button onClick={() => setIsOpen(true)}>{"Open sidebar"}</button>
      {isOpen && (
        <Sidebar containerWidth={1000}>
          <aside data-testid="monitor-sidebar">{"Sidebar"}</aside>
        </Sidebar>
      )}
    </>
  );
}

const setup = ({
  isNavbarOpened = true,
  tokenFeatures,
  mcpEnabled = true,
  initialRoute = "/monitor",
  user = createMockUser({ is_superuser: true }),
  children = <div data-testid="content">{"Content"}</div>,
}: SetupOpts = {}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
    "mcp-enabled?": mcpEnabled,
  });

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(
    createMockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
      "mcp-enabled?": mcpEnabled,
    }),
  );
  setupUserKeyValueEndpoints({
    namespace: "monitor",
    key: "isNavbarOpened",
    value: isNavbarOpened,
  });

  const state = createMockState({
    currentUser: user,
    routing: createMockRoutingState({
      locationBeforeTransitions: createMockLocation({ pathname: initialRoute }),
    }),
    settings,
  });

  renderWithProviders(
    <Route element={<MonitorLayout />}>
      <Route path="*" element={children} />
    </Route>,
    {
      initialRoute,
      storeInitialState: state,
      withRouter: true,
    },
  );
};

const CONTENT_MANAGEMENT_GROUP = "Content management";
const LOGS_AND_ACTIVITY_GROUP = "Logs and activity";

describe("MonitorLayout", () => {
  it("groups the sections under static headings with a link for each Monitor section", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("heading", { name: CONTENT_MANAGEMENT_GROUP }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: LOGS_AND_ACTIVITY_GROUP }),
    ).toBeInTheDocument();

    const expectedTabs: [string, string][] = [
      ["Dependency diagnostics", Urls.dependencyDiagnostics()],
      ["Erroring questions", Urls.monitorErroringQuestions()],
      ["Alerts management", Urls.monitorNotifications()],
      ["Background tasks", Urls.monitorTasks()],
      ["Scheduled jobs", Urls.monitorJobs()],
      ["Application logs", Urls.monitorLogs()],
      ["Model caching log", Urls.monitorModelCaching()],
    ];

    expectedTabs.forEach(([name, href]) => {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    });
  });

  const SECTION_CASES = [
    {
      label: "Dependency diagnostics",
      route: Urls.dependencyDiagnostics(),
      section: "diagnostics",
    },
    {
      label: "Erroring questions",
      route: Urls.monitorErroringQuestions(),
      section: "erroring-questions",
    },
    {
      label: "Alerts management",
      route: Urls.monitorNotifications(),
      section: "alerts",
    },
    {
      label: "Background tasks",
      route: Urls.monitorTasks(),
      section: "tasks",
    },
    {
      label: "Scheduled jobs",
      route: Urls.monitorJobs(),
      section: "jobs",
    },
    {
      label: "Application logs",
      route: Urls.monitorLogs(),
      section: "logs",
    },
    {
      label: "Model caching log",
      route: Urls.monitorModelCaching(),
      section: "model-caching",
    },
  ] as const;

  it.each(SECTION_CASES)(
    "marks $label as the current page for its route",
    async ({ label, route }) => {
      setup({ initialRoute: route });

      await waitFor(() => {
        expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
      });

      const activeLink = screen.getByRole("link", { name: label });
      expect(activeLink).toHaveAttribute("aria-current", "page");
      expect(screen.getAllByRole("link", { current: "page" })).toEqual([
        activeLink,
      ]);
    },
  );

  it.each(SECTION_CASES)(
    "tracks opening the $label section",
    async ({ label, section }) => {
      trackMonitorSectionClicked.mockClear();
      setup();

      await userEvent.click(await screen.findByRole("link", { name: label }));

      expect(trackMonitorSectionClicked).toHaveBeenCalledWith(section);
    },
  );

  // These sub-paths overlap: Urls.monitorAiAuditing() is a string prefix of
  // both Urls.monitorAiAuditingConversations() and Urls.monitorAiAuditingMcp().
  // getActiveSection() in MonitorLayout.tsx must check the more specific
  // MCP/Conversations routes before the bare Usage stats route, or the
  // ts-pattern P.string.startsWith(...) match would resolve the wrong section
  // for every route in this group.
  const AI_AUDITING_SECTION_CASES = [
    {
      label: "Usage stats",
      route: Urls.monitorAiAuditing(),
      section: "ai-auditing-usage-stats",
    },
    {
      label: "Conversations",
      route: Urls.monitorAiAuditingConversations(),
      section: "ai-auditing-conversations",
    },
    {
      label: "MCP analytics",
      route: Urls.monitorAiAuditingMcp(),
      section: "ai-auditing-mcp",
    },
  ] as const;

  it.each(AI_AUDITING_SECTION_CASES)(
    "marks $label as the current page for its route",
    async ({ label, route }) => {
      setup({
        initialRoute: route,
        tokenFeatures: { audit_app: true, ai_controls: true },
      });

      await waitFor(() => {
        expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
      });

      const activeLink = screen.getByRole("link", { name: label });
      expect(activeLink).toHaveAttribute("aria-current", "page");
      expect(screen.getAllByRole("link", { current: "page" })).toEqual([
        activeLink,
      ]);
    },
  );

  it.each(AI_AUDITING_SECTION_CASES)(
    "tracks opening the $label section",
    async ({ label, section }) => {
      trackMonitorSectionClicked.mockClear();
      setup({ tokenFeatures: { audit_app: true, ai_controls: true } });

      await userEvent.click(await screen.findByRole("link", { name: label }));

      expect(trackMonitorSectionClicked).toHaveBeenCalledWith(section);
    },
  );

  it("hides the migrated Tools tabs for an analyst without the monitoring permission", async () => {
    setup({
      user: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
        permissions: { can_access_monitoring: false },
      }),
    });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("heading", { name: LOGS_AND_ACTIVITY_GROUP }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "Dependency diagnostics" }),
    ).toBeInTheDocument();
    [
      "Background tasks",
      "Scheduled jobs",
      "Application logs",
      "Erroring questions",
      "Model caching log",
      "Alerts management",
    ].forEach((name) => {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    });
  });

  it("hides Dependency diagnostics for a monitoring-only user, and hides Alerts management (admin-only)", async () => {
    setup({
      user: createMockUser({
        is_superuser: false,
        is_data_analyst: false,
        permissions: { can_access_monitoring: true },
      }),
    });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("link", { name: "Dependency diagnostics" }),
    ).not.toBeInTheDocument();
    [
      "Background tasks",
      "Scheduled jobs",
      "Application logs",
      "Model caching log",
    ].forEach((name) => {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("link", { name: "Alerts management" }),
    ).not.toBeInTheDocument();
  });

  it("hides Alerts management for an analyst even with the monitoring permission", async () => {
    setup({
      user: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
        permissions: { can_access_monitoring: true },
      }),
    });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("link", { name: "Erroring questions" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Alerts management" }),
    ).not.toBeInTheDocument();
  });

  it("renders the content area", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("renders the AppSwitcher in Monitor view", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(screen.getByTestId("monitor-main")).toContainElement(
      screen.getByTestId("app-switcher-target"),
    );
  });

  it("renders monitor sidebar outside the padded main content area", async () => {
    setup({ children: <TestSidebarSetter /> });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-sidebar")).toBeInTheDocument();
    });

    expect(screen.getByTestId("monitor-main")).toContainElement(
      screen.getByTestId("content"),
    );
    expect(screen.getByTestId("monitor-main")).not.toContainElement(
      screen.getByTestId("monitor-sidebar"),
    );
    expect(screen.getByTestId("monitor-sidebar-region")).toContainElement(
      screen.getByTestId("monitor-sidebar"),
    );
  });

  it("does not rerender main content when the sidebar is toggled", async () => {
    const onRender = jest.fn();
    setup({ children: <TestSidebarToggle onRender={onRender} /> });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });
    const renderCount = onRender.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Open sidebar" }));

    expect(screen.getByTestId("monitor-sidebar")).toBeInTheDocument();
    expect(onRender).toHaveBeenCalledTimes(renderCount);
  });

  const getTabGem = (name: string) =>
    within(screen.getByRole("link", { name })).queryByTestId("upsell-gem");

  it("gates only Erroring questions when audit_app is unavailable", async () => {
    setup({ tokenFeatures: { dependencies: true, audit_app: false } });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(getTabGem("Erroring questions")).toBeInTheDocument();
    expect(getTabGem("Dependency diagnostics")).not.toBeInTheDocument();
  });

  it("gates only Dependency diagnostics when dependencies is unavailable", async () => {
    setup({ tokenFeatures: { dependencies: false, audit_app: true } });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(getTabGem("Dependency diagnostics")).toBeInTheDocument();
    expect(getTabGem("Erroring questions")).not.toBeInTheDocument();
  });

  it("gates neither when both features are available", async () => {
    setup({ tokenFeatures: { dependencies: true, audit_app: true } });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(getTabGem("Dependency diagnostics")).not.toBeInTheDocument();
    expect(getTabGem("Erroring questions")).not.toBeInTheDocument();
  });

  const AI_AUDITING_GROUP = "AI Auditing";

  it("shows ungated Usage stats, Conversations, and MCP analytics when audit_app and ai_controls are both enabled", async () => {
    setup({ tokenFeatures: { audit_app: true, ai_controls: true } });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("heading", { name: AI_AUDITING_GROUP }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Usage stats" })).toHaveAttribute(
      "href",
      Urls.monitorAiAuditing(),
    );
    expect(getTabGem("Usage stats")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conversations" })).toHaveAttribute(
      "href",
      Urls.monitorAiAuditingConversations(),
    );
    expect(screen.getByRole("link", { name: "MCP analytics" })).toHaveAttribute(
      "href",
      Urls.monitorAiAuditingMcp(),
    );
  });

  it("gates Usage stats and hides Conversations when ai_controls is unavailable", async () => {
    setup({ tokenFeatures: { audit_app: true, ai_controls: false } });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(getTabGem("Usage stats")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Conversations" }),
    ).not.toBeInTheDocument();
  });

  it("hides the whole AI Auditing group when audit_app is unavailable", async () => {
    setup({ tokenFeatures: { audit_app: false, ai_controls: true } });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("heading", { name: AI_AUDITING_GROUP }),
    ).not.toBeInTheDocument();
    ["Usage stats", "Conversations", "MCP analytics"].forEach((name) => {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    });
  });

  it("hides MCP analytics when the MCP server toggle is off", async () => {
    setup({
      tokenFeatures: { audit_app: true, ai_controls: true },
      mcpEnabled: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("link", { name: "Usage stats" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Conversations" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "MCP analytics" }),
    ).not.toBeInTheDocument();
  });

  it("hides the AI Auditing group for a non-admin user", async () => {
    setup({
      tokenFeatures: { audit_app: true, ai_controls: true },
      user: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
        permissions: { can_access_monitoring: true },
      }),
    });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("heading", { name: AI_AUDITING_GROUP }),
    ).not.toBeInTheDocument();
  });
});
