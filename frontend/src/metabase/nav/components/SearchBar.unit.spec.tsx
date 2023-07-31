import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { waitFor, renderWithProviders, screen, within } from "__support__/ui";
import {
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  createMockCollectionItem,
  createMockModelObject,
  createMockRecentItem,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { CollectionItem, RecentItem } from "metabase-types/api";
import SearchBar from "metabase/nav/components/SearchBar";

const TEST_SEARCH_RESULTS: CollectionItem[] = [
  "Card ABC",
  "Card BCD",
  "Card DEF",
  "Card EFG",
].map((name, index) =>
  createMockCollectionItem({
    name,
    id: index + 1,
    getUrl: () => "/",
  }),
);

const TEST_RECENT_VIEWS_RESULTS: RecentItem[] = [
  "Recents ABC",
  "Recents BCD",
  "Recents CDE",
  "Recents DEF",
].map((name, index) =>
  createMockRecentItem({
    model_object: createMockModelObject({ name }),
    model_id: index,
  }),
);

const setup = ({
  initialRoute = "/",
  searchResultItems = TEST_SEARCH_RESULTS,
  recentViewsItems = TEST_RECENT_VIEWS_RESULTS,
} = {}) => {
  const state = createMockState({
    settings: createMockSettingsState({
      "search-typeahead-enabled": true,
    }),
  });

  setupSearchEndpoints(searchResultItems);
  setupRecentViewsEndpoints(recentViewsItems);

  const { history } = renderWithProviders(
    <Route path="*" component={SearchBar} />,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: state,
    },
  );

  return { history };
};

const getSearchBar = () => {
  return screen.getByPlaceholderText("Search…");
};

describe("SearchBar", () => {
  describe("typing a search query", () => {
    it("should change URL when user types a query and hits `Enter`", async () => {
      const { history } = setup();

      userEvent.type(getSearchBar(), "BC{enter}");

      const location = history?.getCurrentLocation();
      expect(location?.pathname).toEqual("search");
      expect(location?.search).toEqual("?q=BC");
    });
    it("should render 'No Results Found' when the query has no results", async () => {
      setup({ searchResultItems: [] });
      const searchBar = getSearchBar();
      userEvent.click(searchBar);
      userEvent.type(searchBar, "XXXXX");
      await waitFor(() =>
        expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument(),
      );

      expect(
        within(screen.getByTestId("search-bar-results-container")).getByText(
          "Didn't find anything",
        ),
      ).toBeInTheDocument();
    });
  });
  describe("focusing on search bar", () => {
    it("should render `Recent Searches` list when clicking the search bar", async () => {
      setup();
      getSearchBar().click();
      expect(await screen.findByText("Recents ABC")).toBeInTheDocument();
    });

    it("should render `Nothing here` and a folder icon if there are no recently viewed items", async () => {
      setup({ recentViewsItems: [] });
      getSearchBar().click();
      expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    });
  });
  describe("keyboard navigation", () => {
    it("should focus on the filter bar when the user tabs from the search bar", () => {
      setup();
      getSearchBar().click();
      userEvent.tab();
      expect(screen.getByTestId("search-bar-filter-button")).toHaveFocus();
    });
    it("should allow navigation through the search results with the keyboard", async () => {
      setup();
      getSearchBar().click();
      userEvent.type(getSearchBar(), "BC");

      await waitFor(() =>
        expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument(),
      );

      const resultItems = await screen.findAllByTestId("search-result-item");
      expect(resultItems.length).toBe(2);

      // tab over the filter button
      userEvent.tab();

      // There are two search results, each with a link to `Our analytics`,
      // so we want to navigate to the search result, then the collection link.
      for (const substring of ["Card ABC", "Card BCD"]) {
        userEvent.tab();

        const filteredElement = resultItems.find(element =>
          element.textContent?.includes(substring),
        );

        expect(filteredElement).not.toBeUndefined();
        expect(filteredElement).toHaveFocus();

        userEvent.tab();

        expect(
          within(filteredElement as HTMLElement).getByText("Our analytics"),
        ).toHaveFocus();
      }
    });
  });
  describe("populating existing query", () => {
    it("should populate text and highlight filter button when a query is in the search bar", () => {
      setup({
        initialRoute: "/search?q=foo&type=card",
      });

      expect(getSearchBar()).toHaveValue("foo");

      expect(
        screen.getByTestId("highlighted-search-bar-filter-button"),
      ).toBeInTheDocument();
    });

    it("should not populate text or highlight filter button on non-search pages", () => {
      setup({
        initialRoute: "/collection/root?q=foo&type=card&type=dashboard",
      });

      expect(getSearchBar()).toHaveValue("");

      expect(
        screen.getByTestId("search-bar-filter-button"),
      ).toBeInTheDocument();
    });
  });
});
