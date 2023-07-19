import _ from "underscore";
import { within } from "@testing-library/react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import {
  createMockCollectionItem,
  createMockSearchResult,
  createMockSearchResults,
} from "metabase-types/api/mocks";
import { setupSearchEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { useSearchListQuery } from "./use-search-list-query";

const TEST_ITEM = createMockCollectionItem();

const TEST_TABLE_DB_ID = 1;
const TEST_SEARCH_METADATA = createMockSearchResults({
  items: [createMockSearchResult({ collection: TEST_ITEM })],
  options: { table_db_id: TEST_TABLE_DB_ID },
});

const TestComponent = () => {
  const {
    data = [],
    metadata,
    isLoading,
    error,
  } = useSearchListQuery({
    query: {
      models: TEST_ITEM.model,
      limit: TEST_SEARCH_METADATA.limit,
      offset: TEST_SEARCH_METADATA.offset,
      table_db_id: TEST_TABLE_DB_ID,
    },
  });

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
      <div data-testid="metadata">
        {metadata && Object.keys(metadata).length > 0
          ? Object.entries(metadata).map(([key, value]) => (
              <div key={key}>
                {key}: {value}
              </div>
            ))
          : "No metadata"}
      </div>
    </div>
  );
};

const setup = () => {
  setupSearchEndpoints([TEST_ITEM]);
  renderWithProviders(<TestComponent />);
};

describe("useSearchListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_ITEM.name)).toBeInTheDocument();
  });

  it("should show metadata from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));

    const searchResultMetdata = _.omit(TEST_SEARCH_METADATA, "data");

    for (const [key, value] of Object.entries(searchResultMetdata)) {
      expect(
        within(screen.getByTestId("metadata")).getByText(`${key}: ${value}`),
      ).toBeInTheDocument();
    }
  });
});
