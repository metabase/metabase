import { Route } from "react-router";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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
}

const setup = ({
  isNavbarOpened = true,
  tokenFeatures,
  initialRoute = "/monitor",
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
    currentUser: createMockUser({ is_superuser: true }),
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
  it("renders the sidebar with the Dependency diagnostics tab", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    const tab = screen.getByRole("link", { name: "Dependency diagnostics" });
    expect(tab).toHaveAttribute("href", Urls.dependencyDiagnostics());
  });

  it("renders the content area", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByTestId("monitor-nav")).toBeInTheDocument();
    });

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
});
