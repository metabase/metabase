import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDashboard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { DashboardInfo } from "./DashboardInfo";

type SetupOpts = {
  hasCacheConfigError?: boolean;
};

function setup({ hasCacheConfigError = false }: SetupOpts = {}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      cache_granular_controls: true,
    }),
  });
  setupEnterpriseOnlyPlugin("caching");
  if (hasCacheConfigError) {
    fetchMock.get("path:/api/cache", 500);
  } else {
    setupPerformanceEndpoints([]);
  }

  renderWithProviders(
    <DashboardInfo
      dashboard={createMockDashboard({ id: 10, can_set_cache_policy: true })}
    />,
    { storeInitialState: createMockState({ settings }) },
  );
}

describe("DashboardInfo", () => {
  it("shows the default caching policy when the dashboard has none of its own", async () => {
    setup();

    expect(await screen.findByText("Caching policy")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("says when the caching policy cannot be loaded", async () => {
    setup({ hasCacheConfigError: true });

    expect(await screen.findByText("Failed to load")).toBeInTheDocument();
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
  });
});
