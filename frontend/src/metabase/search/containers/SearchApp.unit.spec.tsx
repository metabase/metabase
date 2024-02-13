import userEvent from "@testing-library/user-event";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import SearchApp from "metabase/search/containers/SearchApp";
import { Route } from "metabase/hoc/Title";
import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import {
  createMockCollection,
  createMockDatabase,
  createMockSearchResult,
  createMockTable,
  createMockUserListResult,
} from "metabase-types/api/mocks";
import type { EnabledSearchModelType, SearchResult } from "metabase-types/api";

import type { SearchFilters } from "metabase/search/types";
import { checkNotNull } from "metabase/lib/types";

// Mock PAGE_SIZE so we don't have to generate a ton of elements for the pagination test
jest.mock("metabase/search/containers/constants", () => ({
  PAGE_SIZE: 4,
}));

const TYPE_FILTER_LABELS: Record<EnabledSearchModelType, string> = {
  collection: "Collection",
  dashboard: "Dashboard",
  database: "Database",
  dataset: "Model",
  table: "Table",
  card: "Question",
  action: "Action",
  "indexed-entity": "Indexed record",
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

  await waitForLoaderToBeRemoved();

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
      userEvent.click(getNextPageButton());
      await waitForLoaderToBeRemoved();
      expect(getPaginationTotal()).toHaveTextContent(String(TEST_ITEMS.length));
      expect(getPreviousPageButton()).toBeEnabled();
      expect(getNextPageButton()).toBeDisabled();

      expect(getPagination()).toHaveTextContent("5 - 7");

      // test previous page button
      userEvent.click(getPreviousPageButton());
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
        const { history } = await setup({
          searchText: "Test",
        });

        userEvent.click(
          within(screen.getByTestId("type-search-filter")).getByTestId(
            "sidebar-filter-dropdown-button",
          ),
        );

        await waitForLoaderToBeRemoved();

        const popover = within(screen.getByTestId("popover"));
        userEvent.click(
          popover.getByRole("checkbox", {
            name: TYPE_FILTER_LABELS[
              model as EnabledSearchModelType
            ] as EnabledSearchModelType,
          }),
        );
        userEvent.click(popover.getByRole("button", { name: "Apply" }));

        const url = history.getCurrentLocation();
        expect(url.query.type).toEqual(model);
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
          searchFilters: { type: [model as EnabledSearchModelType] },
        });

        expect(screen.getByText(`Results for "${name}"`)).toBeInTheDocument();
        expect(screen.getByTestId("search-result-item")).toBeInTheDocument();
        expect(screen.getByTestId("search-result-item-name")).toHaveTextContent(
          name,
        );

        const typeFilter = within(screen.getByTestId("type-search-filter"));
        const fieldSetContent = typeFilter.getByTestId("field-set-content");

        expect(fieldSetContent).toHaveTextContent(
          TYPE_FILTER_LABELS[model as EnabledSearchModelType],
        );
      },
    );
  });
});
