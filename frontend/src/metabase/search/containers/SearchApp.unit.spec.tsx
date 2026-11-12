import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  type TestRouter,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { SearchFilters } from "metabase/common/search/types";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import { SearchApp } from "metabase/search/containers/SearchApp";
import { checkNotNull } from "metabase/utils/types";
import type { EnabledSearchModel, SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockSearchResult,
  createMockTable,
  createMockTokenFeatures,
  createMockUserListResult,
} from "metabase-types/api/mocks";

// Mock PAGE_SIZE so we don't have to generate a ton of elements for the pagination test
jest.mock("metabase/search/containers/constants", () => ({
  PAGE_SIZE: 4,
}));

const TYPE_FILTER_LABELS: Record<EnabledSearchModel, string> = {
  collection: "Collection",
  dashboard: "Dashboard",
  database: "Database",
  dataset: "Model",
  table: "Table",
  card: "Question",
  measure: "Measure",
  metric: "Metric",
  action: "Action",
  "indexed-entity": "Indexed record",
  document: "Document",
  exploration: "Research",
  transform: "Transform",
  "data-app": "Data app",
};

const TEST_ITEMS: Partial<SearchResult>[] = [
  { name: "Test Card", model: "card" },
  { name: "Test Collection", model: "collection" },
  { name: "Test Dashboard", model: "dashboard" },
  { name: "Test Database", model: "database" },
  { name: "Test Dataset", model: "dataset" },
  { name: "Test Table", model: "table" },
  { name: "Test Action", model: "action" },
];

const TEST_SEARCH_RESULTS: SearchResult[] = TEST_ITEMS.map((metadata, index) =>
  createMockSearchResult({ ...metadata, id: index + 1 }),
);

// Every type that full page search reads from the URL, including the ones
// that the shared results above leave out.
const TYPE_HYDRATION_ITEMS: Partial<SearchResult>[] = [
  ...TEST_ITEMS,
  { name: "Test Indexed Record", model: "indexed-entity" },
  { name: "Test Document", model: "document" },
];

const TYPE_HYDRATION_RESULTS: SearchResult[] = TYPE_HYDRATION_ITEMS.map(
  (metadata, index) => createMockSearchResult({ ...metadata, id: index + 1 }),
);

const TEST_DATABASE = createMockDatabase();
const TEST_TABLE = createMockTable();
const TEST_USER_LIST = [createMockUserListResult()];
const TEST_COLLECTION = createMockCollection();

const setup = async ({
  searchText,
  searchFilters = {},
  searchItems = TEST_SEARCH_RESULTS,
  hasContentVerification = false,
  nativeQueryContents,
}: {
  searchText: string;
  searchFilters?: SearchFilters;
  searchItems?: SearchResult[];
  hasContentVerification?: boolean;
  nativeQueryContents?: ReadonlyMap<SearchResult["id"], string>;
}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      content_verification: hasContentVerification,
    }),
  });
  if (hasContentVerification) {
    setupEnterpriseOnlyPlugin("content_verification");
  }

  setupDatabasesEndpoints([TEST_DATABASE]);
  setupSearchEndpoints(searchItems, undefined, { nativeQueryContents });
  setupTableEndpoints(TEST_TABLE);
  setupUserRecipientsEndpoint({ users: TEST_USER_LIST });
  setupCollectionByIdEndpoint({
    collections: [TEST_COLLECTION],
  });

  // for testing the hydration of search text and filters on page load
  const params = {
    ...searchFilters,
    q: searchText,
  };

  const searchParams = new URLSearchParams(
    // Unjustified type cast. FIXME
    params as unknown as Record<string, string>,
  ).toString();

  const initialRoute = searchParams ? `/search?${searchParams}` : `/search`;

  const { router } = renderWithProviders(
    <Route path="search" element={<SearchApp />} />,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({ settings }),
    },
  );

  await waitForLoaderToBeRemoved();

  return {
    router: checkNotNull(router),
  };
};

const getSearchRequestUrls = () =>
  fetchMock.callHistory
    .calls("path:/api/search")
    .map((call) => new URL(call.url));

const expectLastSearchRequestParam = (name: string, values: string[]) => {
  const lastRequest = getSearchRequestUrls().at(-1);
  expect(lastRequest?.searchParams.getAll(name)).toEqual(values);
};

const expectLocationParam = (
  router: TestRouter,
  name: string,
  values: string[],
) => {
  expect(new URLSearchParams(router.location.search).getAll(name)).toEqual(
    values,
  );
};

const getFilter = (name: string) =>
  within(screen.getByTestId(`${name}-search-filter`));

describe("SearchApp", () => {
  // Undo plugins that a test registers, such as content verification.
  afterEach(reinitialize);

  describe("rendering search results and pagination", () => {
    it("renders empty state when there are no search results", async () => {
      // let's pick some text that doesn't ever match anything
      await setup({ searchText: "oisin" });

      expect(screen.getByText('Results for "oisin"')).toBeInTheDocument();
      expect(
        screen.getByText("There weren't any results for your search."),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("pagination")).not.toBeInTheDocument();
    });

    it("renders search results when there is at least one result", async () => {
      await setup({ searchText: "Card" });

      const searchResultsHeader = screen.getByText('Results for "Card"');
      expect(searchResultsHeader).toBeInTheDocument();

      const searchResults = screen.getAllByTestId("search-result-item");
      expect(searchResults.length).toEqual(1);
      expect(screen.queryByLabelText("pagination")).not.toBeInTheDocument();
    });

    it("renders search results and pagination when there is more than PAGE_SIZE results", async () => {
      await setup({ searchText: "Test" });
      const getPaginationTotal = () => screen.getByTestId("pagination-total");
      const getPagination = () => screen.getByLabelText("pagination");
      const getNextPageButton = () => screen.getByTestId("next-page-btn");
      const getPreviousPageButton = () =>
        screen.getByTestId("previous-page-btn");

      expect(getPaginationTotal()).toHaveTextContent(String(TEST_ITEMS.length));
      expect(getPreviousPageButton()).toBeDisabled();
      expect(getNextPageButton()).toBeEnabled();
      expect(getPagination()).toHaveTextContent("1 - 4");

      // test next page button
      await userEvent.click(getNextPageButton());
      await waitForLoaderToBeRemoved();
      expect(getPaginationTotal()).toHaveTextContent(String(TEST_ITEMS.length));
      expect(getPreviousPageButton()).toBeEnabled();
      expect(getNextPageButton()).toBeDisabled();

      expect(getPagination()).toHaveTextContent("5 - 7");

      // test previous page button
      await userEvent.click(getPreviousPageButton());
      await waitForLoaderToBeRemoved();
      expect(getPaginationTotal()).toHaveTextContent(String(TEST_ITEMS.length));
      expect(getPreviousPageButton()).toBeDisabled();
      expect(getNextPageButton()).toBeEnabled();
      expect(getPagination()).toHaveTextContent("1 - 4");
    });
  });

  describe("filtering search results with the sidebar", () => {
    it.each(TEST_SEARCH_RESULTS)(
      "should reload with filtered searches when type=$model is changed in the dropdown sidebar filter",
      async ({ model }) => {
        const { router } = await setup({
          searchText: "Test",
        });

        await userEvent.click(
          within(screen.getByTestId("type-search-filter")).getByTestId(
            "sidebar-filter-dropdown-button",
          ),
        );

        await waitForLoaderToBeRemoved();

        const popover = within(screen.getByTestId("popover"));
        await userEvent.click(
          popover.getByRole("checkbox", {
            // Unjustified type cast. FIXME
            name: TYPE_FILTER_LABELS[
              // Unjustified type cast. FIXME
              model as EnabledSearchModel
            ] as EnabledSearchModel,
          }),
        );
        await userEvent.click(popover.getByRole("button", { name: "Apply" }));

        const url = router.location;
        expect(new URLSearchParams(url.search).get("type")).toEqual(model);
      },
    );
  });

  describe("hydrating search filters from URL", () => {
    // TODO: Add tests for other filters as they come

    it.each(TYPE_HYDRATION_RESULTS)(
      "should filter by type = $name",
      async ({ name, model }) => {
        await setup({
          searchText: name,
          searchItems: TYPE_HYDRATION_RESULTS,
          // Unjustified type cast. FIXME
          searchFilters: { type: [model as EnabledSearchModel] },
        });

        expect(screen.getByText(`Results for "${name}"`)).toBeInTheDocument();
        expect(screen.getByTestId("search-result-item")).toBeInTheDocument();
        expect(screen.getByTestId("search-result-item-name")).toHaveTextContent(
          name,
        );

        const typeFilter = within(screen.getByTestId("type-search-filter"));
        const fieldSetContent = typeFilter.getByTestId("field-set-content");

        expect(fieldSetContent).toHaveTextContent(
          // Unjustified type cast. FIXME
          TYPE_FILTER_LABELS[model as EnabledSearchModel],
        );
      },
    );
  });
  describe("type filter", () => {
    it("should send the type filter from the URL as `models` and remove it with `X`", async () => {
      const { router } = await setup({
        searchText: "e",
        searchFilters: { type: ["card"] },
      });

      expectLastSearchRequestParam("models", ["card"]);
      expect(getFilter("type").getByText("Question")).toBeInTheDocument();

      await userEvent.click(getFilter("type").getByLabelText("close icon"));

      expectLocationParam(router, "type", []);
      expectLocationParam(router, "q", ["e"]);
      await waitFor(() => expectLastSearchRequestParam("models", []));
      expect(getFilter("type").getByText("Content type")).toBeInTheDocument();
      expect(
        getFilter("type").queryByLabelText("close icon"),
      ).not.toBeInTheDocument();
    });
  });

  describe("native query filter", () => {
    const getNativeQuerySwitch = () =>
      getFilter("search_native_query").getByRole("switch");

    it("should turn on searching native queries", async () => {
      const { router } = await setup({ searchText: "reviews" });

      expect(getNativeQuerySwitch()).not.toBeChecked();
      expectLastSearchRequestParam("search_native_query", []);

      await userEvent.click(getNativeQuerySwitch());

      expectLocationParam(router, "search_native_query", ["true"]);
      await waitFor(() =>
        expectLastSearchRequestParam("search_native_query", ["true"]),
      );
      expect(getNativeQuerySwitch()).toBeChecked();
    });

    it("should hydrate the native query filter from the URL and turn it off", async () => {
      const searchItems = [
        createMockSearchResult({ id: 1, name: "Customer reviews" }),
        createMockSearchResult({ id: 2, name: "Native query" }),
        createMockSearchResult({ id: 3, name: "Unrelated question" }),
      ];
      const { router } = await setup({
        searchText: "reviews",
        searchFilters: { search_native_query: true },
        searchItems,
        nativeQueryContents: new Map([[2, "select * from reviews"]]),
      });
      const getResultNames = () =>
        screen
          .getAllByTestId("search-result-item-name")
          .map((item) => item.textContent);

      expect(getNativeQuerySwitch()).toBeChecked();
      expectLastSearchRequestParam("search_native_query", ["true"]);
      expect(screen.getByText('Results for "reviews"')).toBeInTheDocument();
      expect(getResultNames()).toEqual(["Customer reviews", "Native query"]);

      await userEvent.click(getNativeQuerySwitch());

      expectLocationParam(router, "search_native_query", []);
      expectLocationParam(router, "q", ["reviews"]);
      await waitFor(() =>
        expectLastSearchRequestParam("search_native_query", []),
      );
      expectLastSearchRequestParam("q", ["reviews"]);
      await waitForLoaderToBeRemoved();
      expect(getResultNames()).toEqual(["Customer reviews"]);
      expect(getNativeQuerySwitch()).not.toBeChecked();
    });
  });

  describe("pagination and filters", () => {
    it("should reset to the first page when a filter changes (metabase#65501)", async () => {
      const { router } = await setup({ searchText: "Test" });

      await userEvent.click(screen.getByTestId("next-page-btn"));
      await waitForLoaderToBeRemoved();
      expectLocationParam(router, "page", ["1"]);
      expect(screen.getByLabelText("pagination")).toHaveTextContent("5 - 7");

      await userEvent.click(
        getFilter("search_native_query").getByRole("switch"),
      );

      expectLocationParam(router, "search_native_query", ["true"]);
      expectLocationParam(router, "page", []);
      await waitFor(() => expectLastSearchRequestParam("offset", ["0"]));
    });
  });
  describe("verified filter", () => {
    it("should hydrate the verified filter from the URL and turn it off", async () => {
      const { router } = await setup({
        searchText: "e",
        searchFilters: { verified: true },
        hasContentVerification: true,
      });
      const getVerifiedSwitch = () => getFilter("verified").getByRole("switch");

      expect(getVerifiedSwitch()).toBeChecked();
      expectLastSearchRequestParam("verified", ["true"]);
      expect(screen.getByText('Results for "e"')).toBeInTheDocument();

      await userEvent.click(getVerifiedSwitch());

      expectLocationParam(router, "verified", []);
      await waitFor(() => expectLastSearchRequestParam("verified", []));
      expect(getVerifiedSwitch()).not.toBeChecked();
    });
  });
});
