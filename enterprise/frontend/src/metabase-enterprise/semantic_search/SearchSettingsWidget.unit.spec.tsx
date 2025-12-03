import fetchMock from "fetch-mock";
import { match } from "ts-pattern";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  SearchEngineSettingValue,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { SearchSettingsWidget } from "./SearchSettingsWidget";

const defaultMockSearchStatus = {
  indexed_count: 50,
  total_est: 100,
};

const setup = async (
  searchEngine: SearchEngineSettingValue,
  plan: "pro" | "starter",
  searchStatusData = defaultMockSearchStatus,
  statusPollingInterval?: number,
) => {
  const tokenFeatures: Partial<TokenFeatures> = match(plan)
    .with("pro", () => ({
      semantic_search: true,
      hosting: true,
    }))
    .with("starter", () => ({
      hosting: true,
    }))
    .exhaustive();

  const settings = createMockSettings({
    "search-engine": searchEngine,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([
    {
      key: "search-engine",
      value: searchEngine,
      is_env_setting: false,
      description: "Search engine to use",
      env_name: "METABASE_SEARCH_ENGINE",
    },
  ]);

  // Mock the search status API
  fetchMock.get("path:/api/ee/semantic-search/status", searchStatusData, {
    name: "search-sync-status",
  });

  renderWithProviders(
    <SearchSettingsWidget statusPollingInterval={statusPollingInterval} />,
    {
      storeInitialState: createMockState({
        settings: createMockSettingsState(settings),
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );

  expect(
    await screen.findByTestId("search-engine-setting"),
  ).toBeInTheDocument();
};

const progressBar = () => screen.findByRole("progressbar");
const toggle = () => screen.findByRole("switch");

describe("SearchSettingsWidget", () => {
  it("should display upsell for non-pro plans", async () => {
    await setup("semantic", "starter");
    expect(
      await screen.findByText(/Advanced semantic search/),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Get this with Pro/)).toBeInTheDocument();
  });

  it("should display setting toggle as disabled for pro plans", async () => {
    await setup("semantic", "pro");

    expect(
      await screen.findByText("Advanced semantic search"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("upsell-semantic-search"),
    ).not.toBeInTheDocument();
    expect(await toggle()).toBeDisabled();
    expect(await toggle()).toBeChecked();
  });

  it("should show progress when indexing is in progress", async () => {
    await setup("semantic", "pro", { indexed_count: 25, total_est: 100 });

    expect(
      await screen.findByText("Initializing search index..."),
    ).toBeInTheDocument();
    expect(await progressBar()).toHaveAttribute("aria-valuenow", "25");
  });

  it("should not show progress when once indexing is complete", async () => {
    await setup("semantic", "pro", { indexed_count: 50, total_est: 100 }, 50);

    expect(
      await screen.findByText("Initializing search index..."),
    ).toBeInTheDocument();
    expect(await progressBar()).toHaveAttribute("aria-valuenow", "50");

    fetchMock.modifyRoute("search-sync-status", {
      response: () => ({
        indexed_count: 100,
        total_est: 100,
      }),
    });
    expect(
      await screen.findByText(/Initialized search index/),
    ).toBeInTheDocument();
    expect(await progressBar()).toHaveAttribute("aria-valuenow", "100");
  });

  it("should not show progress when indexing was already complete", async () => {
    await setup("semantic", "pro", { indexed_count: 100, total_est: 100 });

    await waitFor(() => {
      expect(
        screen.queryByText("Initializing search index..."),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("should handle API errors", async () => {
    fetchMock.get("path:/api/ee/semantic-search/status", 500);
    await setup("semantic", "pro");

    expect(
      await screen.findByText("Unable to fetch health status of search index."),
    ).toBeInTheDocument();
  });
});
