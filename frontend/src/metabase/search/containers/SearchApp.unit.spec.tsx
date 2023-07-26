import querystring from "querystring";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import SearchApp from "metabase/search/containers/SearchApp";
import { Route } from "metabase/hoc/Title";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  createMockDatabase,
  createMockSearchResult,
} from "metabase-types/api/mocks";
import { SearchFilterType } from "metabase/nav/components/Search/SearchFilterModal/types";
import { SearchResult } from "metabase-types/api";

// Mock PAGE_SIZE so we don't have to generate a ton of elements for the pagination test
jest.mock("metabase/search/containers/constants", () => ({
  PAGE_SIZE: 3,
}));

const TRANSLATED_SIDEBAR_NAMES: Record<string, string> = {
  "All results": "All results",
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
  { name: "Card", model: "card" },
  { name: "Collection", model: "collection" },
  { name: "Dashboard", model: "dashboard" },
  { name: "Database", model: "database" },
  { name: "Dataset", model: "dataset" },
  { name: "Table", model: "table" },
  { name: "Pulse", model: "pulse" },
  { name: "Segment", model: "segment" },
  { name: "Metric", model: "metric" },
];

const TEST_SEARCH_RESULTS = TEST_ITEMS.map((metadata, index) =>
  createMockSearchResult({ ...metadata, id: index + 1 }),
);

const TEST_DATABASE = createMockDatabase();

const setup = async ({
  searchText,
  searchFilters = {},
  searchItems = TEST_SEARCH_RESULTS,
}: {
  searchText: string;
  searchFilters?: SearchFilterType;
  searchItems?: SearchResult[];
}) => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupSearchEndpoints(searchItems);

  // for testing the hydration of search text and filters on page load
  const params = {
    ...searchFilters,
    q: searchText,
  };

  const searchParams = querystring.stringify(params);
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
    history,
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
      // TODO: DRY my dude
      await setup({ searchText: "a" });

      expect(screen.getByTestId("pagination-total")).toHaveTextContent("5");
      expect(screen.getByTestId("previous-page-btn")).toBeDisabled();
      expect(screen.getByTestId("next-page-btn")).toBeEnabled();
      expect(screen.getByLabelText("pagination")).toHaveTextContent("1 - 3");

      // test next page button
      userEvent.click(screen.getByTestId("next-page-btn"));
      await waitFor(() => {
        expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
      });
      expect(screen.getByTestId("pagination-total")).toHaveTextContent("5");
      expect(screen.getByTestId("previous-page-btn")).toBeEnabled();
      expect(screen.getByTestId("next-page-btn")).toBeDisabled();

      expect(screen.getByLabelText("pagination")).toHaveTextContent("4 - 5");

      // test previous page button
      userEvent.click(screen.getByTestId("previous-page-btn"));
      await waitFor(() => {
        expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
      });
      expect(screen.getByTestId("pagination-total")).toHaveTextContent("5");
      expect(screen.getByTestId("previous-page-btn")).toBeDisabled();
      expect(screen.getByTestId("next-page-btn")).toBeEnabled();
      expect(screen.getByLabelText("pagination")).toHaveTextContent("1 - 3");
    });
  });

  describe("filtering search results with the sidebar", () => {
    it("should reload with filtered searches when a type on the right sidebar is clicked without changing URL", async () => {
      const { history } = await setup({
        searchText: "Card",
      });

      let url = history?.getCurrentLocation();
      const { pathname: prevPathname, search: prevSearch } = url ?? {};

      expect(screen.getAllByTestId("type-sidebar-item")).toHaveLength(2);

      const expectedSidebarLabels = ["All items", "Questions"];
      screen.getAllByTestId("type-sidebar-item").forEach(item => {
        expect(expectedSidebarLabels).toContain(item.textContent);
      });

      userEvent.click(screen.getByText("Questions"));

      await waitFor(() => {
        expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
      });

      expect(screen.getByText('Results for "Card"')).toBeInTheDocument();
      expect(screen.getByTestId("search-result-item")).toBeInTheDocument();
      expect(screen.getByTestId("search-result-item-name")).toHaveTextContent(
        "Card",
      );

      url = history?.getCurrentLocation();
      const { pathname, search } = url ?? {};
      expect(pathname).toEqual(prevPathname);
      expect(search).toEqual(prevSearch);
    });
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
        expect(screen.getAllByTestId("type-sidebar-item")).toHaveLength(2);
        expect(screen.getByTestId("type-sidebar")).toHaveTextContent(
          "All items",
        );
        expect(screen.getByTestId("type-sidebar")).toHaveTextContent(
          TRANSLATED_SIDEBAR_NAMES[model],
        );
      },
    );
  });
});
