import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionsEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { SearchBar } from "metabase/nav/components/search/SearchBar";
import { Route } from "metabase/router";
import * as iframeUtils from "metabase/utils/iframe";
import { checkNotNull } from "metabase/utils/types";
import type { CollectionItem, RecentItem } from "metabase-types/api";
import {
  createMockCollectionItem,
  createMockRecentTableItem,
  createMockUser,
} from "metabase-types/api/mocks";

// The search debounce is idle time in these tests: they assert what a search
// returns, not that the input waits before it asks.
jest.mock("metabase/utils/constants", () => ({
  ...jest.requireActual("metabase/utils/constants"),
  SEARCH_DEBOUNCE_DURATION: 0,
}));

const TEST_SEARCH_RESULTS: CollectionItem[] = [
  "Card ABC",
  "Card BCD",
  "Card CDE",
  "Card DEF",
].map((name, index) =>
  createMockCollectionItem({
    name,
    id: index + 1,
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

  const { router } = renderWithProviders(
    <Route path="*" element={<SearchBar />} />,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: state,
    },
  );

  return { router: checkNotNull(router) };
};

const getSearchBar = () => {
  return screen.getByPlaceholderText("Search…");
};

const getSearchRequestsByContext = (context: string) =>
  fetchMock.callHistory.calls().filter((call) => {
    const url = new URL(call.url);
    return (
      url.pathname === "/api/search" &&
      url.searchParams.get("context") === context
    );
  });

const getFloatingContainer = () =>
  screen.getByTestId("search-results-floating-container");

describe("SearchBar", () => {
  describe("typing a search query", () => {
    it("should change URL when user types a query and hits `Enter`", async () => {
      const { router } = setup();

      await userEvent.type(getSearchBar(), "BC{enter}");

      const location = router.location;
      expect(location.pathname).toEqual("/search");
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

        const filteredElement = resultItems.find((element) =>
          element.textContent?.includes(cardName),
        );

        expect(filteredElement).not.toBeUndefined();
        expect(screen.getByText(cardName)).toHaveFocus();

        await userEvent.tab();

        expect(
          // Unjustified type cast. FIXME
          within(filteredElement as HTMLElement).getByText("Our analytics"),
        ).toHaveFocus();
      }
    });
  });

  describe("accessing full page search with `Enter`", () => {
    it("should only search and open full page search when a text query is entered", async () => {
      const { router } = setup({
        searchResultItems: [
          createMockCollectionItem({ id: 11, name: "Orders in a dashboard" }),
        ],
      });

      await userEvent.click(getSearchBar());
      await userEvent.keyboard("{Enter}");

      expect(
        await within(getFloatingContainer()).findByText("Recently viewed"),
      ).toBeInTheDocument();
      expect(router.location.pathname).toBe("/");

      await userEvent.type(getSearchBar(), " ");
      expect(getSearchBar()).toHaveValue(" ");
      expect(
        within(getFloatingContainer()).getByText("Recently viewed"),
      ).toBeInTheDocument();
      await userEvent.keyboard("{Enter}");
      expect(router.location.pathname).toBe("/");
      expect(getSearchRequestsByContext("search-bar")).toHaveLength(0);

      await userEvent.clear(getSearchBar());
      // pasted, so that "ord" is one change, like the Cypress test under a fake clock
      await userEvent.click(getSearchBar());
      await userEvent.paste("ord");
      expect(getSearchBar()).toHaveValue("ord");
      await waitFor(() =>
        expect(getSearchRequestsByContext("search-bar")).toHaveLength(1),
      );
      expect(
        new URL(
          getSearchRequestsByContext("search-bar")[0].url,
        ).searchParams.get("q"),
      ).toBe("ord");
      expect(
        await screen.findByTestId("search-bar-results-container"),
      ).toBeVisible();

      await userEvent.clear(getSearchBar());
      await userEvent.paste(" ");
      expect(getSearchBar()).toHaveValue(" ");
      expect(
        await within(getFloatingContainer()).findByText("Recently viewed"),
      ).toBeVisible();
      expect(
        screen.queryByTestId("search-bar-results-container"),
      ).not.toBeInTheDocument();
      expect(getSearchRequestsByContext("search-bar")).toHaveLength(1);
    });
  });

  describe("command palette trigger", () => {
    it("should show the trigger when the search bar is active", async () => {
      setup();

      await userEvent.click(getSearchBar());

      expect(
        await screen.findByRole("button", { name: / \+ K/ }),
      ).toBeInTheDocument();
    });

    it("should not be accessible when doing full app embedding", async () => {
      const isWithinIframeSpy = jest
        .spyOn(iframeUtils, "isWithinIframe")
        .mockReturnValue(true);

      try {
        setup();

        await userEvent.click(getSearchBar());

        expect(await screen.findByText("Recents ABC")).toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: / \+ K/ }),
        ).not.toBeInTheDocument();
      } finally {
        isWithinIframeSpy.mockRestore();
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
      const { router } = setup({
        initialRoute: "/search?q=foo&type=card",
      });

      await userEvent.clear(getSearchBar());
      await userEvent.type(getSearchBar(), "bar{enter}");

      const location = router.location;

      expect(location.pathname).toEqual("/search");
      expect(location.search).toEqual("?q=bar&type=card");
    });

    it("should not keep URL search filters when not in the search app", async () => {
      const { router } = setup({
        initialRoute: "/collection/root?q=foo&type=card&type=dashboard",
      });

      await userEvent.clear(getSearchBar());
      await userEvent.type(getSearchBar(), "bar{enter}");

      const location = router.location;

      expect(location.pathname).toEqual("/search");
      expect(location.search).toEqual("?q=bar");
    });
  });
});
