import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCollectionsEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  within,
  waitForLoaderToBeRemoved,
  waitFor,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { SearchBar } from "metabase/nav/components/search/SearchBar";
import type { CollectionItem, RecentItem } from "metabase-types/api";
import {
  createMockCollectionItem,
  createMockRecentTableItem,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

const TEST_SEARCH_RESULTS: CollectionItem[] = [
  "Card ABC",
  "Card BCD",
  "Card CDE",
  "Card DEF",
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
  createMockRecentTableItem({
    name,
    display_name: name,
    id: index + 1,
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
  setupUserRecipientsEndpoint({ users: [createMockUser()] });
  setupCollectionsEndpoints({ collections: [] });

  const { history } = renderWithProviders(
    <Route path="*" component={SearchBar} />,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: state,
    },
  );

  return { history: checkNotNull(history) };
};

const getSearchBar = () => {
  return screen.getByPlaceholderText("Search…");
};

describe("SearchBar", () => {
  describe("typing a search query", () => {
    it("should change URL when user types a query and hits `Enter`", async () => {
      const { history } = setup();

      await userEvent.type(getSearchBar(), "BC{enter}");

      const location = history.getCurrentLocation();
      expect(location.pathname).toEqual("search");
      expect(location.search).toEqual("?q=BC");
    });

    it("should render 'No Results Found' when the query has no results", async () => {
      setup({ searchResultItems: [] });
      const searchBar = getSearchBar();
      await userEvent.type(searchBar, "XXXXX");
      await waitForLoaderToBeRemoved();

      expect(screen.getByText("Didn't find anything")).toBeInTheDocument();
    });
  });

  describe("focusing on search bar", () => {
    it("should render `Recent Searches` list when clicking the search bar", async () => {
      setup();
      await userEvent.click(getSearchBar());
      expect(await screen.findByText("Recents ABC")).toBeInTheDocument();
    });

    it("should render `Nothing here` and a folder icon if there are no recently viewed items", async () => {
      setup({ recentViewsItems: [] });
      await userEvent.click(getSearchBar());
      expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    });
  });

  describe("keyboard navigation", () => {
    it("should allow navigation through the search results with the keyboard", async () => {
      setup();
      await userEvent.click(getSearchBar());
      await userEvent.type(getSearchBar(), "BC");

      // wait for dropdown to open
      await waitForLoaderToBeRemoved();

      const resultItems = await screen.findAllByTestId("search-result-item");
      expect(resultItems.length).toBe(2);

      // wait for all of the elements of the search result to load
      await waitFor(() => {
        expect(
          screen.queryByTestId("info-text-collection-loading-text"),
        ).not.toBeInTheDocument();
      });

      // There are two search results, each with a link to `Our analytics`,
      // so we want to navigate to the search result, then the collection link.
      for (const cardName of ["Card ABC", "Card BCD"]) {
        await userEvent.tab();

        const filteredElement = resultItems.find(element =>
          element.textContent?.includes(cardName),
        );

        expect(filteredElement).not.toBeUndefined();
        expect(screen.getByText(cardName)).toHaveFocus();

        await userEvent.tab();

        expect(
          within(filteredElement as HTMLElement).getByText("Our analytics"),
        ).toHaveFocus();
      }
    });
  });

  describe("populating existing query", () => {
    it("should populate text when a query is in the search bar", () => {
      setup({
        initialRoute: "/search?q=foo&type=card",
      });

      expect(getSearchBar()).toHaveValue("foo");
    });

    it("should not populate text on non-search pages", () => {
      setup({
        initialRoute: "/collection/root?q=foo&type=card&type=dashboard",
      });

      expect(getSearchBar()).toHaveValue("");
    });
  });

  describe("persisting search filters", () => {
    it("should keep URL search filters when changing the text query", async () => {
      const { history } = setup({
        initialRoute: "/search?q=foo&type=card",
      });

      await userEvent.clear(getSearchBar());
      await userEvent.type(getSearchBar(), "bar{enter}");

      const location = history.getCurrentLocation();

      expect(location.pathname).toEqual("search");
      expect(location.search).toEqual("?q=bar&type=card");
    });

    it("should not keep URL search filters when not in the search app", async () => {
      const { history } = setup({
        initialRoute: "/collection/root?q=foo&type=card&type=dashboard",
      });

      await userEvent.clear(getSearchBar());
      await userEvent.type(getSearchBar(), "bar{enter}");

      const location = history.getCurrentLocation();

      expect(location.pathname).toEqual("search");
      expect(location.search).toEqual("?q=bar");
    });
  });
});
