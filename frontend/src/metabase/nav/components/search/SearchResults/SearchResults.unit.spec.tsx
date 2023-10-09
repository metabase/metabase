import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { setupSearchEndpoints } from "__support__/server-mocks";
import type {
  SearchResult,
  SearchResults as SearchResultsType,
} from "metabase-types/api";
import { createMockSearchResult } from "metabase-types/api/mocks";
import { checkNotNull } from "metabase/core/utils/types";
import { SearchResults } from "metabase/nav/components/search/SearchResults";

type SearchResultsSetupProps = {
  searchResults?: SearchResult[];
  forceEntitySelect?: boolean;
  searchText?: string;
  footer?: ((metadata: Omit<SearchResultsType, "data">) => JSX.Element) | null;
};

const TEST_FOOTER = (metadata: Omit<SearchResultsType, "data">) => (
  <div data-testid="footer">
    <div data-testid="test-total">{metadata.total}</div>
  </div>
);

const TEST_SEARCH_RESULTS = [1, 2, 3].map((id, index) =>
  createMockSearchResult({
    id,
    name: `Test ${index}`,
    description: `Test description ${index}`,
  }),
);
const setup = async ({
  searchResults = TEST_SEARCH_RESULTS,
  forceEntitySelect = false,
  searchText = "test",
  footer = null,
}: SearchResultsSetupProps = {}) => {
  setupSearchEndpoints(searchResults);

  const onEntitySelect = jest.fn();

  const { history } = renderWithProviders(
    <Route
      path="*"
      component={() => (
        <SearchResults
          onEntitySelect={onEntitySelect}
          forceEntitySelect={forceEntitySelect}
          searchText={searchText}
          footerComponent={footer}
        />
      )}
    />,
    {
      withRouter: true,
    },
  );

  await waitForLoaderToBeRemoved();

  return {
    onEntitySelect,
    history: checkNotNull(history),
  };
};

describe("SearchResults", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  it("should display the empty state when no results are found", async () => {
    await setup({ searchResults: [] });

    expect(screen.getByText("Didn't find anything")).toBeInTheDocument();
  });

  it("should display results when results are found", async () => {
    await setup();

    expect(screen.getAllByTestId("search-result-item")).toHaveLength(
      TEST_SEARCH_RESULTS.length,
    );

    for (const { name } of TEST_SEARCH_RESULTS) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("should allow for keyboard navigation through the results", async () => {
    await setup();

    for (const { name } of TEST_SEARCH_RESULTS) {
      userEvent.keyboard("{arrowdown}");

      const resultItems = await screen.findAllByTestId("search-result-item");

      const filteredElement = resultItems.find(element =>
        element.textContent?.includes(name),
      );
      expect(filteredElement).toHaveAttribute("data-is-selected", "true");
    }
  });

  it("should trigger the onEntitySelect callback when forceEntitySelect=true and an entity is selected", async () => {
    const { history, onEntitySelect } = await setup({
      forceEntitySelect: true,
    });

    userEvent.click(screen.getByText(TEST_SEARCH_RESULTS[0].name));

    expect(onEntitySelect).toHaveBeenCalled();
    expect(onEntitySelect.mock.lastCall[0].name).toEqual(
      TEST_SEARCH_RESULTS[0].name,
    );
    expect(onEntitySelect.mock.lastCall[0].description).toEqual(
      TEST_SEARCH_RESULTS[0].description,
    );
    expect(history.getCurrentLocation().pathname).toEqual("/");
  });

  it("should redirect to entity URL when forceEntitySelect=false and an entity is selected", async () => {
    const { history, onEntitySelect } = await setup({
      forceEntitySelect: false,
    });

    userEvent.click(screen.getByText(TEST_SEARCH_RESULTS[0].name));

    expect(onEntitySelect).not.toHaveBeenCalled();
    expect(history.getCurrentLocation().pathname).toEqual("/question/1-test-0");
  });

  it("should redirect to URL when the entity is an indexed-entity type", async () => {
    const indexedEntityResult = createMockSearchResult({
      id: 1,
      name: "Test",
      description: "Test description",
      model: "indexed-entity",
    });

    const { history, onEntitySelect } = await setup({
      searchResults: [indexedEntityResult],
    });
    userEvent.click(screen.getByText(indexedEntityResult.name));

    expect(onEntitySelect).toHaveBeenCalled();
    expect(onEntitySelect.mock.lastCall[0].name).toEqual(
      indexedEntityResult.name,
    );
    expect(onEntitySelect.mock.lastCall[0].description).toEqual(
      indexedEntityResult.description,
    );
    expect(history.getCurrentLocation().pathname).toEqual("/");
  });

  it("should render the footer with metadata", async () => {
    await setup({ footer: TEST_FOOTER });

    expect(screen.getByTestId("footer")).toBeInTheDocument();
    expect(screen.getByTestId("test-total")).toHaveTextContent(
      TEST_SEARCH_RESULTS.length.toString(),
    );
  });
});
