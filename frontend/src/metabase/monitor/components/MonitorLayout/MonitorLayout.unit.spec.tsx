import userEvent from "@testing-library/user-event";
import { type ReactNode, memo, useState } from "react";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
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
    settings,
  });

  renderWithProviders(
    <Route
      path="/monitor"
      component={() => <MonitorLayout>{children}</MonitorLayout>}
    />,
    {
      initialRoute,
      storeInitialState: state,
      withRouter: true,
    },
  );
};

describe("MonitorLayout", () => {
  it("renders a navbar with tabs for each Monitor section", async () => {
    setup({ tokenFeatures: { audit_app: true } });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    const expectedTabs: [string, string][] = [
      ["Dependency diagnostics", Urls.dependencyDiagnostics()],
      ["Tasks", Urls.monitorTasks()],
      ["Jobs", Urls.monitorJobs()],
      ["Logs", Urls.monitorLogs()],
      ["Erroring questions", Urls.monitorErroringQuestions()],
      ["Model cache log", Urls.monitorModelCaching()],
      ["Alerts management", Urls.monitorNotifications()],
      ["AI Stats", Urls.monitorStats()],
      ["AI Conversations", Urls.monitorConversations()],
    ];

    expectedTabs.forEach(([name, href]) => {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    });
  });

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
      screen.getByRole("link", { name: "Dependency diagnostics" }),
    ).toBeInTheDocument();
    [
      "Tasks",
      "Jobs",
      "Logs",
      "Erroring questions",
      "Model cache log",
      "Alerts management",
      "AI Stats",
      "AI Conversations",
    ].forEach((name) => {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    });
  });

  it("hides Dependency diagnostics for a monitoring-only user, and hides Alerts management/Stats/Conversations (admin-only)", async () => {
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
    ["Tasks", "Jobs", "Logs", "Model cache log"].forEach((name) => {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("link", { name: "Alerts management" }),
    ).not.toBeInTheDocument();
    ["AI Stats", "AI Conversations"].forEach((name) => {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    });
  });

  it("hides Alerts management/Stats/Conversations for an analyst even with the monitoring permission", async () => {
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
      screen.queryByRole("link", { name: "Alerts management" }),
    ).not.toBeInTheDocument();
    ["AI Stats", "AI Conversations"].forEach((name) => {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    });
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
    // dependencies present (Dependency diagnostics ungated), audit_app absent.
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

  it("hides Stats and Conversations entirely for an admin without audit_app (no upsell gem)", async () => {
    setup({ tokenFeatures: { audit_app: false } });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("link", { name: "AI Stats" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "AI Conversations" }),
    ).not.toBeInTheDocument();
  });

  it("shows Stats and Conversations for an admin with audit_app", async () => {
    setup({ tokenFeatures: { audit_app: true } });

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: "AI Stats" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "AI Conversations" }),
    ).toBeInTheDocument();
  });
});
