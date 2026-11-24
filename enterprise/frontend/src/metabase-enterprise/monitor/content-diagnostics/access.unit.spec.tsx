import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupListStaleFindingsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { getMonitorRoutes } from "metabase/monitor/routes";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  createMockContentDiagnosticsStaleFinding,
  createMockListStaleFindingsResponse,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

const UPSELL_TITLE = "Find and clean up stale content without hunting it down";
const STALE_DASHBOARD_NAME = "Quarterly stale dashboard";

interface SetupOpts {
  hasContentDiagnosticsFeature: boolean;
}

/**
 * Renders the real Monitor route tree (guards, layout and the EE plugin) as an
 * admin on an enterprise build. Only the token feature differs between cases,
 * so the findings endpoints are mocked the same way in both.
 */
function setup({ hasContentDiagnosticsFeature }: SetupOpts) {
  const settings = mockSettings({
    "has-user-setup": true,
    "token-features": createMockTokenFeatures({
      content_diagnostics: hasContentDiagnosticsFeature,
    }),
  });
  setupEnterprisePlugins();

  setupUserKeyValueEndpoints({
    namespace: "monitor",
    key: "isNavbarOpened",
    value: true,
  });
  setupUserKeyValueEndpoints({
    namespace: "content_diagnostics",
    key: "stale",
    value: {},
  });
  setupListStaleFindingsEndpoint(
    createMockListStaleFindingsResponse({
      data: [
        createMockContentDiagnosticsStaleFinding({
          entity_display_name: STALE_DASHBOARD_NAME,
        }),
      ],
      total: 1,
    }),
  );

  mockGetBoundingClientRect({ width: 100, height: 100 });

  return renderWithProviders(<Route path="/">{getMonitorRoutes()}</Route>, {
    withRouter: true,
    initialRoute: Urls.staleContent(),
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings,
    }),
  });
}

const getContentDiagnosticsCalls = () =>
  fetchMock.callHistory
    .calls()
    .filter((call) =>
      new URL(call.url).pathname.startsWith("/api/ee/content-diagnostics/"),
    );

describe("content diagnostics access (enterprise build)", () => {
  afterEach(() => {
    reinitialize();
  });

  it("shows the upsell and asks for no findings without the token", async () => {
    setup({ hasContentDiagnosticsFeature: false });

    expect(
      await screen.findByRole("heading", { name: "Content diagnostics" }),
    ).toBeVisible();
    expect(
      await within(await screen.findByTestId("monitor-main")).findByText(
        UPSELL_TITLE,
      ),
    ).toBeVisible();
    // Give a request that the page would send after mounting time to go out.
    await act(() => new Promise((resolve) => setTimeout(resolve, 1000)));
    expect(screen.queryByText(STALE_DASHBOARD_NAME)).not.toBeInTheDocument();
    expect(getContentDiagnosticsCalls()).toHaveLength(0);
  });

  it("loads the findings instead of the upsell with the token", async () => {
    setup({ hasContentDiagnosticsFeature: true });

    expect(await screen.findByText(STALE_DASHBOARD_NAME)).toBeVisible();
    expect(screen.queryByText(UPSELL_TITLE)).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/ee/content-diagnostics/stale"),
    ).toHaveLength(1);
  });
});
