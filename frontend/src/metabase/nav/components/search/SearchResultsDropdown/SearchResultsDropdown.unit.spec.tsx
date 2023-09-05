import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";
import { Route } from "react-router";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSearchResult } from "metabase-types/api/mocks";
import { setupSearchEndpoints } from "__support__/server-mocks";
import type { SearchResult } from "metabase-types/api";
import { checkNotNull } from "metabase/core/utils/types";
import { SearchResultsDropdown } from "./SearchResultsDropdown";

const TEST_SEARCH_RESULTS = [
  createMockSearchResult({ id: 1, name: "Test 1" }),
  createMockSearchResult({ id: 2, name: "Test 2" }),
  createMockSearchResult({
    id: 3,
    name: "Indexed Entity",
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

  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  return { onSearchItemSelect, goToSearchApp, history: checkNotNull(history) };
};

describe("SearchResultsDropdown", () => {
  it("should redirect to item's page when an item is selected", async () => {
    const { history } = await setup();
    const searchItem = screen.getByText("Test 1");
    userEvent.click(searchItem);
    expect(history.getCurrentLocation().pathname).toEqual("/question/1-test-1");
  });

  it("should call goToSearchApp when the footer is clicked", async () => {
    const { goToSearchApp } = await setup();
    const footer = await screen.findByTestId("search-dropdown-footer");
    userEvent.click(footer);
    expect(goToSearchApp).toHaveBeenCalled();
  });

  it("should call onSearchItemSelect when a result is clicked and has type=indexed-entity", async () => {
    const { onSearchItemSelect } = await setup({
      searchText: "Indexed Entity",
    });
    const searchItem = screen.getByText("Indexed Entity");
    userEvent.click(searchItem);
    expect(onSearchItemSelect).toHaveBeenCalled();
  });

  it("should not render the footer if there are no search results", async () => {
    await setup({ searchResults: [] });
    expect(
      screen.queryByTestId("search-dropdown-footer"),
    ).not.toBeInTheDocument();
  });

  it("should render the footer if there are search results", async () => {
    await setup();
    expect(screen.getByTestId("search-dropdown-footer")).toBeInTheDocument();
  });
});
