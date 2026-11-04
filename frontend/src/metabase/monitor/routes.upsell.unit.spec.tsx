import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupContentDiagnosticsCountsEndpoint,
  setupDependencyCountsEndpoint,
  setupListStaleFindingsEndpoint,
  setupTaskCountsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import {
  createMockContentDiagnosticsStaleFinding,
  createMockListStaleFindingsResponse,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { getMonitorRedirects, getMonitorRoutes } from "./routes";

const UPSELL_TITLE = "Find and clean up stale content without hunting it down";

const getContentDiagnosticsCalls = () =>
  fetchMock.callHistory
    .calls()
    .filter((call) => call.url.includes("/api/ee/content-diagnostics"));

// The real route tree, guards, layouts and pages: nothing in the monitor
// section is mocked, so any request made by the diagnostics pages is visible.
function setup({ hasFeature }: { hasFeature: boolean }) {
  setupContentDiagnosticsCountsEndpoint();
  setupDependencyCountsEndpoint();
  setupTaskCountsEndpoint();
  setupListStaleFindingsEndpoint(
    createMockListStaleFindingsResponse({
      data: [
        createMockContentDiagnosticsStaleFinding({
          entity_display_name: "Old dashboard",
        }),
      ],
    }),
  );
  mockGetBoundingClientRect({ width: 100, height: 100 });
  setupUserKeyValueEndpoints({
    namespace: "content_diagnostics",
    key: "stale",
    value: {},
  });

  setupUserKeyValueEndpoints({
    namespace: "monitor",
    key: "isNavbarOpened",
    value: true,
  });

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      content_diagnostics: hasFeature,
    }),
  });

  if (hasFeature) {
    setupEnterpriseOnlyPlugin("monitor_content_diagnostics");
  }

  return renderWithProviders(
    <Route path="/">
      {getMonitorRedirects()}
      {getMonitorRoutes()}
    </Route>,
    {
      withRouter: true,
      initialRoute: "/monitor/content-diagnostics/stale",
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings,
      }),
    },
  );
}

describe("content diagnostics upsell (real monitor routes)", () => {
  afterEach(() => {
    reinitialize();
  });

  it("shows the upsell and makes no content diagnostics requests without the feature", async () => {
    setup({ hasFeature: false });

    expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
    expect(screen.queryByText("Old dashboard")).not.toBeInTheDocument();
    await fetchMock.callHistory.flush(true);
    expect(getContentDiagnosticsCalls()).toHaveLength(0);
  });

  it("requests the findings with the feature (positive control for the test above)", async () => {
    setup({ hasFeature: true });

    expect(await screen.findByText("Old dashboard")).toBeInTheDocument();
    expect(screen.queryByText(UPSELL_TITLE)).not.toBeInTheDocument();
    expect(
      getContentDiagnosticsCalls().some((call) =>
        call.url.includes("/api/ee/content-diagnostics/stale"),
      ),
    ).toBe(true);
  });
});
