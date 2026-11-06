import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { SearchFilters } from "metabase/common/search/types";
import { Route } from "metabase/router";
import { SearchApp } from "metabase/search/containers/SearchApp";
import { checkNotNull } from "metabase/utils/types";
import type { EnabledSearchModel, SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockSearchResult,
  createMockTable,
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

const TEST_DATABASE = createMockDatabase();
const TEST_TABLE = createMockTable();
const TEST_USER_LIST = [createMockUserListResult()];
const TEST_COLLECTION = createMockCollection();

const setup = async ({
  searchText,
  searchFilters = {},
  searchItems = TEST_SEARCH_RESULTS,
}: {
  searchText: string;
  searchFilters?: SearchFilters;
  searchItems?: SearchResult[];
}) => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupSearchEndpoints(searchItems);
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
    },
  );

  await waitForLoaderToBeRemoved();

  return {
    router: checkNotNull(router),
  };
};

describe("SearchApp", () => {
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

  describe("accessing full page search with `Enter`", () => {
    it("should only search and open full page search when a text query is entered (search-app request)", async () => {
      await setup({ searchText: "orders" });

      expect(screen.getByText('Results for "orders"')).toBeInTheDocument();

      const searchRequests = fetchMock.callHistory.calls().filter((call) => {
        return new URL(call.url).pathname === "/api/search";
      });
      expect(searchRequests).toHaveLength(1);
      const params = new URL(searchRequests[0].url).searchParams;
      expect(params.get("context")).toBe("search-app");
      expect(params.get("q")).toBe("orders");
    });
  });

  describe("empty state", () => {
    it("should work for user without data permissions (metabase#16855) (empty state on the search page)", async () => {
      await setup({ searchText: "product" });

      const searchApp = within(screen.getByTestId("search-app"));
      expect(searchApp.getByText("Didn't find anything")).toBeInTheDocument();
      expect(
        searchApp.getByText("There weren't any results for your search."),
      ).toBeInTheDocument();
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

    it.each(TEST_SEARCH_RESULTS)(
      "should filter by type = $name",
      async ({ name, model }) => {
        await setup({
          searchText: name,
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
});
