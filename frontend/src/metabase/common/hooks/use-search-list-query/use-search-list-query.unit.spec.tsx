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
import { checkNotNull } from "metabase/core/utils/types";
import { useSearchListQuery } from "./use-search-list-query";

const TEST_ITEM = createMockCollectionItem();

const TEST_TABLE_DB_ID = 1;
const TEST_SEARCH_RESULTS = createMockSearchResults({
  items: [createMockSearchResult({ collection: TEST_ITEM })],
  options: { table_db_id: TEST_TABLE_DB_ID },
});

const TEST_SEARCH_METADATA = _.omit(TEST_SEARCH_RESULTS, "data");

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
        {metadata && (
          <>
            <div data-testid="available-models">
              {(metadata.available_models || []).join(", ")}
            </div>
            <div data-testid="limit">{metadata.limit}</div>
            <div data-testid="models">{(metadata.models || []).join(", ")}</div>
            <div data-testid="offset">{metadata.offset}</div>
            <div data-testid="table-db-id">{metadata.table_db_id}</div>
            <div data-testid="total">{metadata.total}</div>
          </>
        )}
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

    const metadata = within(screen.getByTestId("metadata"));

    const availableModelTextContent = checkNotNull(
      TEST_SEARCH_METADATA.available_models,
    ).join(", ");

    const modelsTextContent = checkNotNull(TEST_SEARCH_METADATA.models).join(
      ", ",
    );

    expect(metadata.getByTestId("available-models")).toHaveTextContent(
      availableModelTextContent,
    );
    expect(metadata.getByTestId("limit")).toHaveTextContent(
      String(TEST_SEARCH_METADATA.limit),
    );
    expect(metadata.getByTestId("models")).toHaveTextContent(modelsTextContent);
    expect(metadata.getByTestId("offset")).toHaveTextContent(
      String(TEST_SEARCH_METADATA.offset),
    );
    expect(metadata.getByTestId("table-db-id")).toHaveTextContent(
      String(TEST_SEARCH_METADATA.table_db_id),
    );
    expect(metadata.getByTestId("total")).toHaveTextContent(
      String(TEST_SEARCH_METADATA.total),
    );
  });
});
