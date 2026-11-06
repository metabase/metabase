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
  type TestRouter,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { SearchFilters } from "metabase/common/search/types";
import { Route } from "metabase/router";
import { SearchApp } from "metabase/search/containers/SearchApp";
import { checkNotNull } from "metabase/utils/types";
import type {
  EnabledSearchModel,
  SearchResult,
  UserListResult,
} from "metabase-types/api";
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
const BOBBY = createMockUserListResult({
  id: 11,
  first_name: "Bobby",
  last_name: "Tables",
  common_name: "Bobby Tables",
  email: "bobby@metabase.test",
});
const ROBERT = createMockUserListResult({
  id: 12,
  first_name: "Robert",
  last_name: "Tableton",
  common_name: "Robert Tableton",
  email: "robert@metabase.test",
});
const TWO_USERS = [BOBBY, ROBERT];
const TEST_COLLECTION = createMockCollection();

const setup = async ({
  searchText,
  searchFilters = {},
  searchItems = TEST_SEARCH_RESULTS,
  users = TEST_USER_LIST,
}: {
  searchText: string;
  searchFilters?: SearchFilters;
  searchItems?: SearchResult[];
  users?: UserListResult[];
}) => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupSearchEndpoints(searchItems);
  setupTableEndpoints(TEST_TABLE);
  setupUserRecipientsEndpoint({ users });
  setupCollectionByIdEndpoint({
    collections: [TEST_COLLECTION],
  });

  // for testing the hydration of search text and filters on page load
  const params = {
    ...searchFilters,
    q: searchText,
  };

  const urlSearchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => urlSearchParams.append(key, String(item)));
    } else if (value != null) {
      urlSearchParams.append(key, String(value));
    }
  });
  const searchParams = urlSearchParams.toString();

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

const openUserFilter = async (name: string) => {
  await userEvent.click(screen.getByTestId(`${name}-search-filter`));
  return within(await screen.findByTestId("popover"));
};

const DATE_FILTER_CASES = [
  ["past1days", "Yesterday"],
  ["past1weeks", "Previous week"],
  ["past7days", "Previous 7 days"],
  ["past30days", "Previous 30 days"],
  ["past1months", "Previous month"],
  ["past3months", "Previous 3 months"],
  ["past12months", "Previous 12 months"],
];

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

    it("should hydrate created_by filter and remove a user from it", async () => {
      const { router } = await setup({
        searchText: "reviews",
        searchFilters: { created_by: [BOBBY.id, ROBERT.id] },
        users: TWO_USERS,
      });

      expect(
        await getFilter("created_by").findByText("2 users selected"),
      ).toBeInTheDocument();
      expect(
        getFilter("created_by").getByLabelText("close icon"),
      ).toBeVisible();
      expectLastSearchRequestParam("created_by", ["11", "12"]);

      const popover = await openUserFilter("created_by");
      // remove Robert Tableton from the created_by filter
      await userEvent.click(
        within(popover.getByTestId("search-user-select-box")).getByLabelText(
          "Remove Robert Tableton",
        ),
      );
      await userEvent.click(popover.getByText("Apply"));

      expectLocationParam(router, "created_by", ["11"]);
      await waitFor(() => expectLastSearchRequestParam("created_by", ["11"]));
      expect(
        await getFilter("created_by").findByText("Bobby Tables"),
      ).toBeInTheDocument();
    });

    it("should filter last_edited results by one or more users and hydrate the filter from the URL (select one user)", async () => {
      const { router } = await setup({
        searchText: "reviews",
        users: TWO_USERS,
      });
      expectLastSearchRequestParam("last_edited_by", []);

      const popover = await openUserFilter("last_edited_by");
      await userEvent.click(await popover.findByText("Robert Tableton"));
      await userEvent.click(popover.getByText("Apply"));

      expectLocationParam(router, "last_edited_by", ["12"]);
      await waitFor(() =>
        expectLastSearchRequestParam("last_edited_by", ["12"]),
      );
      expect(
        await getFilter("last_edited_by").findByText("Robert Tableton"),
      ).toBeInTheDocument();
    });

    it("should filter last_edited results by one or more users and hydrate the filter from the URL (select two users)", async () => {
      const { router } = await setup({
        searchText: "reviews",
        users: TWO_USERS,
      });
      expectLastSearchRequestParam("last_edited_by", []);

      const popover = await openUserFilter("last_edited_by");
      await userEvent.click(await popover.findByText("Robert Tableton"));
      await userEvent.click(popover.getByText("Bobby Tables"));
      await userEvent.click(popover.getByText("Apply"));

      expectLocationParam(router, "last_edited_by", ["12", "11"]);
      await waitFor(() =>
        expectLastSearchRequestParam("last_edited_by", ["12", "11"]),
      );
      expect(
        await getFilter("last_edited_by").findByText("2 users selected"),
      ).toBeInTheDocument();
    });

    it("should filter last_edited results by one or more users and hydrate the filter from the URL (hydrate from the URL)", async () => {
      await setup({
        searchText: "reviews",
        searchFilters: { last_edited_by: [ROBERT.id] },
        users: TWO_USERS,
      });

      expect(
        await getFilter("last_edited_by").findByText("Robert Tableton"),
      ).toBeInTheDocument();
      expect(
        getFilter("last_edited_by").getByLabelText("close icon"),
      ).toBeVisible();
      expectLastSearchRequestParam("last_edited_by", ["12"]);
    });

    it("should allow to remove a user from the `last_edited_by` filter, and remove the filter when `X` is clicked (remove a user)", async () => {
      const { router } = await setup({
        searchText: "reviews",
        searchFilters: { last_edited_by: [ROBERT.id, BOBBY.id] },
        users: TWO_USERS,
      });
      expectLastSearchRequestParam("last_edited_by", ["12", "11"]);

      const popover = await openUserFilter("last_edited_by");
      // remove Robert Tableton from the last_edited_by filter
      await userEvent.click(
        within(popover.getByTestId("search-user-select-box")).getByLabelText(
          "Remove Robert Tableton",
        ),
      );
      await userEvent.click(popover.getByText("Apply"));

      expectLocationParam(router, "last_edited_by", ["11"]);
      await waitFor(() =>
        expectLastSearchRequestParam("last_edited_by", ["11"]),
      );
    });

    it("should allow to remove a user from the `last_edited_by` filter, and remove the filter when `X` is clicked (remove the filter with X)", async () => {
      const { router } = await setup({
        searchText: "reviews",
        searchFilters: { last_edited_by: [ROBERT.id, BOBBY.id] },
        users: TWO_USERS,
      });

      expect(
        await getFilter("last_edited_by").findByText("2 users selected"),
      ).toBeInTheDocument();
      expectLastSearchRequestParam("last_edited_by", ["12", "11"]);
      await userEvent.click(
        getFilter("last_edited_by").getByLabelText("close icon"),
      );

      expectLocationParam(router, "last_edited_by", []);
      await waitFor(() => expectLastSearchRequestParam("last_edited_by", []));
      expect(
        getFilter("last_edited_by").getByText("Last editor"),
      ).toBeInTheDocument();
    });

    it.each(
      ["created_at", "last_edited_at"].flatMap((name) =>
        DATE_FILTER_CASES.map(([literal, label]) => [
          `${name}=${literal}`,
          name,
          literal,
          label,
        ]),
      ),
    )(
      "should hydrate created_at and last_edited_at from the URL (%s)",
      async (_title, name, literal, label) => {
        await setup({
          searchText: name === "created_at" ? "orders" : "reviews",
          searchFilters: { [name]: literal },
        });

        expect(getFilter(name).getByText(label)).toBeInTheDocument();
        expect(getFilter(name).getByLabelText("close icon")).toBeVisible();
        expectLastSearchRequestParam(name, [literal]);
      },
    );
  });
});
