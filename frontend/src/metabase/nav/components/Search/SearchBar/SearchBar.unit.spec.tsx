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
import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { CollectionItem, RecentItem } from "metabase-types/api";

const TEST_SEARCH_RESULTS: CollectionItem[] = [
  createMockCollectionItem({ name: "Jeff Winger" }),
  createMockCollectionItem({ name: "Britta Perry" }),
  createMockCollectionItem({ name: "Troy Barnes" }),
  createMockCollectionItem({ name: "Abed Nadir" }),
];

const TEST_RECENT_VIEWS_RESULTS: RecentItem[] = [
  "Bojack Horseman",
  "Todd Chavez, Mister Peanutbutter",
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

const setup = ({ searchResultItems = TEST_SEARCH_RESULTS, recentViewsItems = TEST_RECENT_VIEWS_RESULTS } = {}) => {
  const state = createMockState({
    settings: createMockSettingsState({
      "search-typeahead-enabled": true,
    }),
  });

  setupSearchEndpoints(searchResultItems);
  setupRecentViewsEndpoints(recentViewsItems);

  renderWithProviders(<Route path="*" component={TestSearchBarComponent} />, {
    withRouter: true,
    storeInitialState: state,
  });
};

describe("SearchBar", () => {
  describe("typing a search query", () => {
    it("should render search results when user types a query and hits `Enter`", async () => {});
    it("should render 'No Results Found' when the query has no results", () => {});
  });
  describe("focusing on search bar", () => {
    it("should render `Recent Searches` list when clicking the search bar", async () => {
      setup();
      screen.getByPlaceholderText("Search…").click();
      await screen.findByText("Bojack Horseman");
    });

    it("should render `Nothing here` and a folder icon if there are no recently viewed items", async () => {
      setup({ recentViewsItems: [] });
      screen.getByPlaceholderText("Search…").click();
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
  });
});
