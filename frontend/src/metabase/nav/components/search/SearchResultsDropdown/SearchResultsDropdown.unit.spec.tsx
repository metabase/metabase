import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCollectionByIdEndpoint,
  setupSearchEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";

import { SearchResultsDropdown } from "./SearchResultsDropdown";

// Mock MIN_RESULTS_FOR_FOOTER_TEXT so we don't have to generate a ton of elements for the footer test
jest.mock(
  "metabase/nav/components/search/SearchResultsDropdown/constants",
  () => ({
    MIN_RESULTS_FOR_FOOTER_TEXT: 1,
  }),
);

const TEST_COLLECTION = createMockCollection();

const TEST_SEARCH_RESULTS = [
  createMockSearchResult({
    id: 1,
    name: "Test 1",
    collection: TEST_COLLECTION,
  }),
  createMockSearchResult({
    id: 2,
    name: "Test 2",
    collection: TEST_COLLECTION,
  }),
  createMockSearchResult({
    id: 3,
    name: "Indexed record",
    model: "indexed-entity",
  }),
];

const setup = async ({
  searchResults = TEST_SEARCH_RESULTS,
  searchText = "Test",
}: { searchResults?: SearchResult[]; searchText?: string } = {}) => {
  const onSearchItemSelect = jest.fn();
  const goToSearchApp = jest.fn();

  setupSearchEndpoints(searchResults);
  setupUserRecipientsEndpoint({ users: [createMockUser()] });
  setupCollectionByIdEndpoint({
    collections: [TEST_COLLECTION],
  });

  const { history } = renderWithProviders(
    <Route
      path="*"
      component={() => (
        <SearchResultsDropdown
          searchText={searchText}
          onSearchItemSelect={onSearchItemSelect}
          goToSearchApp={goToSearchApp}
        />
      )}
    />,
    {
      withRouter: true,
    },
  );

  await waitForLoaderToBeRemoved();

  return { onSearchItemSelect, goToSearchApp, history: checkNotNull(history) };
};

describe("SearchResultsDropdown", () => {
  it("should redirect to item's page when a item is selected", async () => {
    const { history } = await setup({ searchText: "Test 1" });
    const searchItem = screen.getByTestId("search-result-item");

    expect(searchItem).toHaveTextContent("Test 1");

    await userEvent.click(searchItem);

    expect(history.getCurrentLocation().pathname).toEqual("/question/1-test-1");
  });

  it("should call goToSearchApp when the footer is clicked", async () => {
    const { goToSearchApp } = await setup();
    const footer = await screen.findByTestId("search-dropdown-footer");
    await userEvent.click(footer);
    expect(goToSearchApp).toHaveBeenCalled();
  });

  it("should call onSearchItemSelect when a result is clicked and has type=indexed-entity", async () => {
    const { onSearchItemSelect } = await setup({
      searchText: "Indexed record",
    });
    const searchItem = screen.getByText("Indexed record");
    await userEvent.click(searchItem);
    expect(onSearchItemSelect).toHaveBeenCalled();
  });

  it("should not render the footer if there are no search results", async () => {
    await setup({ searchResults: [] });
    expect(
      screen.queryByTestId("search-dropdown-footer"),
    ).not.toBeInTheDocument();
  });

  it("should only render 'View all results' if there are less than MAX_SEARCH_RESULTS_FOR_FOOTER results for the footer", async () => {
    await setup({ searchResults: TEST_SEARCH_RESULTS.slice(0, 1) });
    expect(screen.getByTestId("search-dropdown-footer")).toBeInTheDocument();
    expect(screen.getByText("View and filter results")).toBeInTheDocument();
  });

  it("should render 'View all X results' if there are more than MAX_SEARCH_RESULTS_FOR_FOOTER results for the footer", async () => {
    await setup({
      searchText: "e",
    });
    expect(screen.getByTestId("search-dropdown-footer")).toBeInTheDocument();
    expect(
      screen.getByText(
        `View and filter all ${TEST_SEARCH_RESULTS.length} results`,
      ),
    ).toBeInTheDocument();
  });
});
