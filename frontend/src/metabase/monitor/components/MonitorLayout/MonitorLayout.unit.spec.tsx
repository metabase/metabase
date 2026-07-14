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

interface SetupOpts {
  isNavbarOpened?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
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
  initialRoute = "/monitor",
  user = createMockUser({ is_superuser: true }),
  children = <div data-testid="content">{"Content"}</div>,
}: SetupOpts = {}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(
    createMockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
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
    <Route
      path="*"
      component={() => <MonitorLayout>{children}</MonitorLayout>}
    />,
    {
      initialRoute,
      storeInitialState: state,
      withRouter: true,
    },
  );
};

const CONTENT_MANAGEMENT_GROUP = "Content management";
const LOGS_AND_ACTIVITY_GROUP = "Logs and activity";

const expandGroup = async (name: string) => {
  const linkCountBefore = screen.queryAllByRole("link").length;
  await userEvent.click(screen.getByRole("button", { name }));
  await waitFor(() => {
    expect(screen.queryAllByRole("link").length).toBeGreaterThan(
      linkCountBefore,
    );
  });
};

describe("MonitorLayout", () => {
  it("groups the sections into collapsible menus that start collapsed", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: CONTENT_MANAGEMENT_GROUP }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: LOGS_AND_ACTIVITY_GROUP }),
    ).toHaveAttribute("aria-expanded", "false");

    [
      "Dependency diagnostics",
      "Erroring questions",
      "Alerts management",
      "Background tasks",
      "Scheduled jobs",
      "Application logs",
      "Model caching log",
    ].forEach((name) => {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    });
  });

  it("renders a link for each Monitor section once its group is expanded", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    await expandGroup(CONTENT_MANAGEMENT_GROUP);
    await expandGroup(LOGS_AND_ACTIVITY_GROUP);

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

  it("opens the group containing the active route on mount", async () => {
    setup({ initialRoute: Urls.monitorTasks() });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: LOGS_AND_ACTIVITY_GROUP }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      await screen.findByRole("link", { name: "Background tasks" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: CONTENT_MANAGEMENT_GROUP }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: "Dependency diagnostics" }),
    ).not.toBeInTheDocument();
  });

  const SECTION_CASES: {
    label: string;
    route: string;
    group: string;
    otherGroup: string;
  }[] = [
    {
      label: "Dependency diagnostics",
      route: Urls.dependencyDiagnostics(),
      group: CONTENT_MANAGEMENT_GROUP,
      otherGroup: LOGS_AND_ACTIVITY_GROUP,
    },
    {
      label: "Erroring questions",
      route: Urls.monitorErroringQuestions(),
      group: CONTENT_MANAGEMENT_GROUP,
      otherGroup: LOGS_AND_ACTIVITY_GROUP,
    },
    {
      label: "Alerts management",
      route: Urls.monitorNotifications(),
      group: CONTENT_MANAGEMENT_GROUP,
      otherGroup: LOGS_AND_ACTIVITY_GROUP,
    },
    {
      label: "Background tasks",
      route: Urls.monitorTasks(),
      group: LOGS_AND_ACTIVITY_GROUP,
      otherGroup: CONTENT_MANAGEMENT_GROUP,
    },
    {
      label: "Scheduled jobs",
      route: Urls.monitorJobs(),
      group: LOGS_AND_ACTIVITY_GROUP,
      otherGroup: CONTENT_MANAGEMENT_GROUP,
    },
    {
      label: "Application logs",
      route: Urls.monitorLogs(),
      group: LOGS_AND_ACTIVITY_GROUP,
      otherGroup: CONTENT_MANAGEMENT_GROUP,
    },
    {
      label: "Model caching log",
      route: Urls.monitorModelCaching(),
      group: LOGS_AND_ACTIVITY_GROUP,
      otherGroup: CONTENT_MANAGEMENT_GROUP,
    },
  ];

  it.each(SECTION_CASES)(
    "opens the owning group and marks $label as the current page for its route",
    async ({ label, route, group, otherGroup }) => {
      setup({ initialRoute: route });

      await waitFor(() => {
        expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: group })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.getByRole("button", { name: otherGroup })).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      const activeLink = await screen.findByRole("link", { name: label });
      expect(activeLink).toHaveAttribute("aria-current", "page");
      expect(screen.getAllByRole("link", { current: "page" })).toEqual([
        activeLink,
      ]);
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
      screen.queryByRole("button", { name: LOGS_AND_ACTIVITY_GROUP }),
    ).not.toBeInTheDocument();

    await expandGroup(CONTENT_MANAGEMENT_GROUP);

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

    await expandGroup(CONTENT_MANAGEMENT_GROUP);
    await expandGroup(LOGS_AND_ACTIVITY_GROUP);

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

    await expandGroup(CONTENT_MANAGEMENT_GROUP);

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
    await expandGroup(CONTENT_MANAGEMENT_GROUP);

    expect(getTabGem("Erroring questions")).toBeInTheDocument();
    expect(getTabGem("Dependency diagnostics")).not.toBeInTheDocument();
  });

  it("gates only Dependency diagnostics when dependencies is unavailable", async () => {
    setup({ tokenFeatures: { dependencies: false, audit_app: true } });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });
    await expandGroup(CONTENT_MANAGEMENT_GROUP);

    expect(getTabGem("Dependency diagnostics")).toBeInTheDocument();
    expect(getTabGem("Erroring questions")).not.toBeInTheDocument();
  });

  it("gates neither when both features are available", async () => {
    setup({ tokenFeatures: { dependencies: true, audit_app: true } });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });
    await expandGroup(CONTENT_MANAGEMENT_GROUP);

    expect(getTabGem("Dependency diagnostics")).not.toBeInTheDocument();
    expect(getTabGem("Erroring questions")).not.toBeInTheDocument();
  });
});
