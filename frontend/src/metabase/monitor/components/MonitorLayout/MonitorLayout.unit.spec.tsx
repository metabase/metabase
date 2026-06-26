import { Route } from "react-router";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import * as Urls from "metabase/urls";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { MonitorLayout } from "./MonitorLayout";

interface SetupOpts {
  isNavbarOpened?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  initialRoute?: string;
  user?: ReturnType<typeof createMockUser>;
}

const setup = ({
  isNavbarOpened = true,
  tokenFeatures,
  initialRoute = "/monitor",
  user = createMockUser({ is_superuser: true }),
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
      component={() => (
        <MonitorLayout>
          <div data-testid="content">{"Content"}</div>
        </MonitorLayout>
      )}
    />,
    {
      initialRoute,
      storeInitialState: state,
      withRouter: true,
    },
  );
};

describe("MonitorLayout", () => {
  it("renders a sidebar tab for each Monitor section (Dependency diagnostics + migrated Tools)", async () => {
    setup();

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
    ];

    expectedTabs.forEach(([name, href]) => {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    });
  });

  it("hides the migrated Tools tabs for an analyst without the monitoring permission", async () => {
    // GDGT-2684 regression guard: these pages keep their superuser-or-monitoring
    // access, so an analyst lacking can_access_monitoring sees only Dependency
    // diagnostics in the Monitor nav.
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
    ].forEach((name) => {
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

  it("renders the AppSwitcher in the content shell for every Monitor view", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(screen.getByTestId("app-switcher-target")).toBeInTheDocument();
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
});
