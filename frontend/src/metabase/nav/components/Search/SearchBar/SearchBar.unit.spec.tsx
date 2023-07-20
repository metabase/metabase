<<<<<<< HEAD
=======
import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
>>>>>>> 154f5ec065 (Add test for SearchBar)
import SearchBar from "metabase/nav/components/Search/SearchBar/SearchBar";
import { renderWithProviders, screen } from "__support__/ui";
import {
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  createMockCollectionItem,
  createMockModelObject,
  createMockRecentItem,
} from "metabase-types/api/mocks";
<<<<<<< HEAD
import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
=======
>>>>>>> 154f5ec065 (Add test for SearchBar)
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { CollectionItem, RecentItem } from "metabase-types/api";
<<<<<<< HEAD

const TEST_SEARCH_RESULTS: CollectionItem[] = [
  createMockCollectionItem({ name: "Jeff Winger" }),
  createMockCollectionItem({ name: "Britta Perry" }),
  createMockCollectionItem({ name: "Troy Barnes" }),
  createMockCollectionItem({ name: "Abed Nadir" }),
];

const TEST_RECENT_VIEWS_RESULTS: RecentItem[] = [
  "Bojack Horseman",
  "Todd Chavez, Mister Peanutbutter",
=======
import { delay } from "metabase/lib/promise";

const TEST_SEARCH_RESULTS: CollectionItem[] = [
  "Jeff Winger",
  "Britta Perry",
  "Troy Barnes",
  "Abed Nadir",
].map((name, index) =>
  createMockCollectionItem({
    name,
    id: index + 1,
    getUrl: () => "/",
  }),
);

const TEST_RECENT_VIEWS_RESULTS: RecentItem[] = [
  "Bojack Horseman",
  "Todd Chavez",
  "Mister Peanutbutter",
>>>>>>> 154f5ec065 (Add test for SearchBar)
  "Diane Nguyen",
].map((name, index) =>
  createMockRecentItem({
    model_object: createMockModelObject({ name }),
    model_id: index,
  }),
);

const TestSearchBarComponent = () => {
  return (
    <div>
      <SearchBar />
    </div>
  );
};

<<<<<<< HEAD
const setup = ({ searchResultItems = TEST_SEARCH_RESULTS, recentViewsItems = TEST_RECENT_VIEWS_RESULTS } = {}) => {
=======
const setup = ({
  initialRoute = "/",
  searchResultItems = TEST_SEARCH_RESULTS,
  recentViewsItems = TEST_RECENT_VIEWS_RESULTS,
} = {}) => {
>>>>>>> 154f5ec065 (Add test for SearchBar)
  const state = createMockState({
    settings: createMockSettingsState({
      "search-typeahead-enabled": true,
    }),
  });

  setupSearchEndpoints(searchResultItems);
  setupRecentViewsEndpoints(recentViewsItems);

  renderWithProviders(<Route path="*" component={TestSearchBarComponent} />, {
    withRouter: true,
<<<<<<< HEAD
=======
    initialRoute,
>>>>>>> 154f5ec065 (Add test for SearchBar)
    storeInitialState: state,
  });
};

describe("SearchBar", () => {
  describe("typing a search query", () => {
<<<<<<< HEAD
    it("should render search results when user types a query and hits `Enter`", async () => {});
    it("should render 'No Results Found' when the query has no results", () => {});
=======
    it("should change URL when user types a query and hits `Enter`", async () => {
      setup();
      userEvent.type(screen.getByPlaceholderText("Search…"), "er{enter}");
      await delay(2000);
      expect(window.location.pathname).toBe("/search?q=er");
    });
    it("should render 'No Results Found' when the query has no results", () => {
      expect(true).toBe(false);
    });
>>>>>>> 154f5ec065 (Add test for SearchBar)
  });
  describe("focusing on search bar", () => {
    it("should render `Recent Searches` list when clicking the search bar", async () => {
      setup();
      screen.getByPlaceholderText("Search…").click();
<<<<<<< HEAD
      await screen.findByText("Bojack Horseman");
=======
      expect(await screen.findByText("Bojack Horseman")).toBeInTheDocument();
>>>>>>> 154f5ec065 (Add test for SearchBar)
    });

    it("should render `Nothing here` and a folder icon if there are no recently viewed items", async () => {
      setup({ recentViewsItems: [] });
      screen.getByPlaceholderText("Search…").click();
<<<<<<< HEAD
      await screen.findByText("Nothing here")
      screen.debug(undefined, 100000);
    });
  });
  describe("keyboard navigation", () => {
    it("should focus on the filter bar when the user tabs from the search bar", () => {});
    it("should allow navigation through the search results with the keyboard", () => {});
  });
  describe("highlighting", () => {
    it("should highlight filter button when filters are applied", () => {});
=======
      expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    });
  });
  describe("keyboard navigation", () => {
    it("should focus on the filter bar when the user tabs from the search bar", () => {
      setup();
      screen.getByPlaceholderText("Search…").click();
      userEvent.tab();
      expect(screen.getByTestId("search-bar-filter-button")).toHaveFocus();
    });
    it("should allow navigation through the search results with the keyboard", async () => {
      setup();
      screen.getByPlaceholderText("Search…").click();
      userEvent.type(screen.getByPlaceholderText("Search…"), "er");
      const resultItems = await screen.findAllByTestId("search-result-item");

      /*
       *
       * NOTE TO SELF - MAKE SURE TO MAKE THIS LOOK NICER AND A LITTLE CLEANER
       *
       * */

      expect(resultItems.length).toBe(2);

      // tab over the filter, then tab to the first search item
      userEvent.tab();
      userEvent.tab();

      const filteredElement = resultItems.find(element =>
        element.textContent?.includes("Jeff"),
      );

      expect(filteredElement).toHaveFocus();

      userEvent.tab();

      const secondFilteredElement = resultItems.find(element =>
        element.textContent?.includes("Britta"),
      );

      expect(secondFilteredElement).toHaveFocus();
    });
  });
  describe("highlighting", () => {
    it("should highlight filter button when filters are applied", () => {
      setup({
        initialRoute: "/search?q=foo&type=card",
      });

      expect(
        screen.getByTestId("highlighted-search-bar-filter-button"),
      ).toBeInTheDocument();
    });
>>>>>>> 154f5ec065 (Add test for SearchBar)
  });
});
