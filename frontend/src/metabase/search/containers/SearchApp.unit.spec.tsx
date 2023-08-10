import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import SearchApp from "metabase/search/containers/SearchApp";
import { Route } from "metabase/hoc/Title";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import {
  createMockDatabase,
  createMockSearchResult,
  createMockTable,
} from "metabase-types/api/mocks";
import { SearchResult } from "metabase-types/api";

import { SearchFilters } from "metabase/search/types";
import { checkNotNull } from "metabase/core/utils/types";

// Mock PAGE_SIZE so we don't have to generate a ton of elements for the pagination test
jest.mock("metabase/search/containers/constants", () => ({
  PAGE_SIZE: 3,
}));

const ALL_RESULTS_SIDEBAR_NAME = "All results";

const SIDEBAR_NAMES: Record<string, string> = {
  collection: "Collections",
  dashboard: "Dashboards",
  database: "Databases",
  dataset: "Models",
  metric: "Metrics",
  pulse: "Pulses",
  segment: "Segments",
  table: "Raw Tables",
  card: "Questions",
};

const TEST_ITEMS: Partial<SearchResult>[] = [
  { name: "Test Card", model: "card" },
  { name: "Test Collection", model: "collection" },
  { name: "Test Dashboard", model: "dashboard" },
  { name: "Test Database", model: "database" },
  { name: "Test Dataset", model: "dataset" },
  { name: "Test Table", model: "table" },
  { name: "Test Pulse", model: "pulse" },
  { name: "Test Segment", model: "segment" },
  { name: "Test Metric", model: "metric" },
];

const TEST_SEARCH_RESULTS: SearchResult[] = TEST_ITEMS.map((metadata, index) =>
  createMockSearchResult({ ...metadata, id: index + 1 }),
);

const TEST_DATABASE = createMockDatabase();
const TEST_TABLE = createMockTable();

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

  // for testing the hydration of search text and filters on page load
  const params = {
    ...searchFilters,
    q: searchText,
  };

  const searchParams = new URLSearchParams(
    params as unknown as Record<string, string>,
  ).toString();

  const initialRoute = searchParams ? `/search?${searchParams}` : `/search`;

  const { history } = renderWithProviders(
    <Route path="search" component={SearchApp} />,
    {
      withRouter: true,
      initialRoute,
    },
  );

  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  return {
    history: checkNotNull(history),
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
      await setup({ searchText: "a" });
      const getPaginationTotal = () => screen.getByTestId("pagination-total");
      const getPagination = () => screen.getByLabelText("pagination");
      const getNextPageButton = () => screen.getByTestId("next-page-btn");
      const getPreviousPageButton = () =>
        screen.getByTestId("previous-page-btn");

      expect(getPaginationTotal()).toHaveTextContent("5");
      expect(getPreviousPageButton()).toBeDisabled();
      expect(getNextPageButton()).toBeEnabled();
      expect(getPagination()).toHaveTextContent("1 - 3");

      // test next page button
      userEvent.click(getNextPageButton());
      await waitFor(() => {
        expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
      });
      expect(getPaginationTotal()).toHaveTextContent("5");
      expect(getPreviousPageButton()).toBeEnabled();
      expect(getNextPageButton()).toBeDisabled();

      expect(getPagination()).toHaveTextContent("4 - 5");

      // test previous page button
      userEvent.click(getPreviousPageButton());
      await waitFor(() => {
        expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
      });
      expect(getPaginationTotal()).toHaveTextContent("5");
      expect(getPreviousPageButton()).toBeDisabled();
      expect(getNextPageButton()).toBeEnabled();
      expect(getPagination()).toHaveTextContent("1 - 3");
    });
  });

  describe("filtering search results with the sidebar", () => {
    it.each(TEST_SEARCH_RESULTS)(
      "should reload with filtered searches when type=$model on the right sidebar is clicked without changing URL",
      async ({ model, name }) => {
        const { history } = await setup({
          searchText: "Test",
        });

        let url = history.getCurrentLocation();
        const { pathname: prevPathname, search: prevSearch } = url ?? {};

        const sidebarItems = screen.getAllByTestId("type-sidebar-item");
        expect(sidebarItems).toHaveLength(10);
        expect(sidebarItems[0]).toHaveTextContent(ALL_RESULTS_SIDEBAR_NAME);

        const sidebarItem = screen.getByText(SIDEBAR_NAMES[model]);
        userEvent.click(sidebarItem);
        url = history.getCurrentLocation();
        const { pathname, search } = url ?? {};
        expect(pathname).toEqual(prevPathname);
        expect(search).toEqual(prevSearch);

        const searchResultItem = await screen.findByTestId(
          "search-result-item",
        );
        expect(searchResultItem).toBeInTheDocument();
        expect(searchResultItem).toHaveTextContent(name);
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
          searchFilters: { type: [model] },
        });

        expect(screen.getByText(`Results for "${name}"`)).toBeInTheDocument();
        expect(screen.getByTestId("search-result-item")).toBeInTheDocument();
        expect(screen.getByTestId("search-result-item-name")).toHaveTextContent(
          name,
        );

        const sidebarItems = screen.getAllByTestId("type-sidebar-item");

        expect(sidebarItems).toHaveLength(2);
        expect(sidebarItems[0]).toHaveTextContent(ALL_RESULTS_SIDEBAR_NAME);
        expect(sidebarItems[1]).toHaveTextContent(SIDEBAR_NAMES[model]);
      },
    );
  });
});
