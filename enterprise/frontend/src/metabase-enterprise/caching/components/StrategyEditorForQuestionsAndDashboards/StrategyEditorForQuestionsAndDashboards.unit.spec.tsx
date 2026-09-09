import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupTokenStatusEndpoint } from "__support__/server-mocks";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type {
  CacheConfig,
  CacheConfigWithDetails,
  CacheStrategy,
  CacheableModel,
} from "metabase-types/api";
import { CacheDurationUnit } from "metabase-types/api";
import {
  createMockCacheConfig,
  createMockCollection,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { StrategyEditorForQuestionsAndDashboards } from "./StrategyEditorForQuestionsAndDashboards";

const ROOT_STRATEGY: CacheStrategy = {
  type: "duration",
  duration: 1,
  unit: CacheDurationUnit.Hours,
  refresh_automatically: false,
};

const NO_CACHE_STRATEGY: CacheStrategy = { type: "nocache" };

const createItemConfig = ({
  model,
  id,
  name,
  collectionName,
  strategy,
}: {
  model: CacheableModel;
  id: number;
  name: string;
  collectionName: string;
  strategy: CacheStrategy;
}): CacheConfigWithDetails => ({
  ...createMockCacheConfig({ model, model_id: id, strategy }),
  name,
  collection: createMockCollection({ id: 1, name: collectionName }),
});

const getDefaultConfigs = (): CacheConfig[] => [
  createMockCacheConfig({
    model: "root",
    model_id: 0,
    strategy: ROOT_STRATEGY,
  }),
  createItemConfig({
    model: "dashboard",
    id: 1,
    name: "Sales dashboard",
    collectionName: "Product",
    // Matches the root strategy, so it counts as the default policy
    strategy: ROOT_STRATEGY,
  }),
  createItemConfig({
    model: "question",
    id: 1,
    name: "Revenue question",
    collectionName: "Finance",
    strategy: NO_CACHE_STRATEGY,
  }),
];

const getManyConfigs = (itemCount: number): CacheConfig[] => [
  createMockCacheConfig({
    model: "root",
    model_id: 0,
    strategy: ROOT_STRATEGY,
  }),
  ...Array.from({ length: itemCount }, (_, i) =>
    createItemConfig({
      model: i % 2 === 0 ? "dashboard" : "question",
      id: i + 1,
      name: `Item ${i + 1}`,
      collectionName: i % 2 === 0 ? "Collection Apples" : "Collection Bananas",
      strategy: NO_CACHE_STRATEGY,
    }),
  ),
];

const setup = ({
  configs = getDefaultConfigs(),
}: { configs?: CacheConfig[] } = {}) => {
  mockGetBoundingClientRect({ height: 800, width: 1000 });
  setupEnterprisePlugins();
  setupTokenStatusEndpoint({ valid: true });
  setupPerformanceEndpoints(configs);

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({}),
    settings: mockSettings(
      createMockSettings({
        "token-features": createMockTokenFeatures({
          cache_granular_controls: true,
        }),
      }),
    ),
  });

  renderWithProviders(
    <Route path="*" element={<StrategyEditorForQuestionsAndDashboards />} />,
    { storeInitialState, withRouter: true },
  );
};

describe("StrategyEditorForQuestionsAndDashboards", () => {
  it("shows rows with name, collection and policy", async () => {
    setup();
    expect(await screen.findByText("Sales dashboard")).toBeInTheDocument();
    expect(screen.getByText("Revenue question")).toBeInTheDocument();
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("shows the policy in a lighter color when it matches the default policy", async () => {
    setup();
    expect(await screen.findByText("Duration: 1h")).toHaveAttribute(
      "data-uses-default-policy",
      "true",
    );
    expect(screen.getByText("No caching")).toHaveAttribute(
      "data-uses-default-policy",
      "false",
    );
  });

  it("shows an empty state when nothing has its own caching policy", async () => {
    setup({
      configs: [
        createMockCacheConfig({
          model: "root",
          model_id: 0,
          strategy: ROOT_STRATEGY,
        }),
      ],
    });
    expect(
      await screen.findByText(
        "No dashboards or questions have their own caching policies yet.",
      ),
    ).toBeInTheDocument();
  });

  it("hides search and filter with 10 or fewer items", async () => {
    setup();
    await screen.findByText("Sales dashboard");
    expect(
      screen.queryByPlaceholderText("Search by name or collection…"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Show filters")).not.toBeInTheDocument();
  });

  it("searches by name or collection with more than 10 items", async () => {
    setup({ configs: getManyConfigs(12) });
    const searchInput = await screen.findByPlaceholderText(
      "Search by name or collection…",
    );

    await userEvent.type(searchInput, "Item 3");
    await waitFor(() => {
      expect(screen.queryByText("Item 1")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Item 3")).toBeInTheDocument();

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "Bananas");
    // Even-numbered items live in "Collection Bananas"
    expect(await screen.findByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 4")).toBeInTheDocument();
    expect(screen.queryByText("Item 1")).not.toBeInTheDocument();
  });

  it("filters by caching policy and type", async () => {
    const configs = getManyConfigs(12);
    // Give one dashboard a policy matching the default
    configs[1] = createItemConfig({
      model: "dashboard",
      id: 1,
      name: "Item 1",
      collectionName: "Collection Apples",
      strategy: ROOT_STRATEGY,
    });
    setup({ configs });
    await screen.findByText("Item 1");

    await userEvent.click(screen.getByLabelText("Show filters"));
    await userEvent.click(await screen.findByText("Default"));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => {
      expect(screen.queryByText("Item 2")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Item 1")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Show filters"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Clear filters" }),
    );
    expect(await screen.findByText("Item 2")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Show filters"));
    await userEvent.click(await screen.findByText("Question"));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => {
      // Odd-numbered items are dashboards
      expect(screen.queryByText("Item 1")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Item 2")).toBeInTheDocument();
  });

  it("opens the policy form in a sidesheet on row click", async () => {
    setup();
    await userEvent.click(await screen.findByText("Revenue question"));

    const sidesheet = await screen.findByTestId("cache-policy-panel");
    expect(
      await within(sidesheet).findByText("Revenue question"),
    ).toBeInTheDocument();
    expect(within(sidesheet).getByText("Finance")).toBeInTheDocument();
    expect(
      within(sidesheet).getByTestId("cache-strategy-select"),
    ).toBeInTheDocument();
  });

  it("does not ask to discard after saving an item back to the default policy", async () => {
    setup();
    await userEvent.click(await screen.findByText("Revenue question"));
    await userEvent.click(await screen.findByTestId("cache-strategy-select"));
    await userEvent.click(
      await screen.findByRole("option", { name: /^Default/ }),
    );
    await userEvent.click(screen.getByTestId("strategy-form-submit-button"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("cache-policy-panel"),
      ).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Sales dashboard"));
    expect(
      await screen.findByTestId("cache-strategy-select"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  });

  it("paginates when there are more than 25 items", async () => {
    setup({ configs: getManyConfigs(26) });
    await screen.findByText("Item 1");

    expect(screen.getByTestId("pagination-total")).toHaveTextContent("26");
    // Sorted by name: "Item 1", "Item 10" ... "Item 9" occupy the first page
    expect(screen.queryByText("Item 9")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("next-page-btn"));
    expect(await screen.findByText("Item 9")).toBeInTheDocument();
  });
});
