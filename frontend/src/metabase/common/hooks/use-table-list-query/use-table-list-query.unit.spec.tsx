import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockTable } from "metabase-types/api/mocks";
import { setupTablesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import { useTableListQuery } from "./use-table-list-query";

const TEST_TABLE = createMockTable();

const TestComponent = () => {
  const { data = [], metadata, isLoading, error } = useTableListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(table => (
        <div key={table.id}>{table.name}</div>
      ))}

      <div data-testid="metadata">
        {(!metadata || Object.keys(metadata).length === 0) && "No metadata"}
      </div>
    </div>
  );
};

const setup = () => {
  setupTablesEndpoints([TEST_TABLE]);
  renderWithProviders(<TestComponent />);
};

describe("useTableListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
  });

  it("should not have any metadata in the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(
      within(screen.getByTestId("metadata")).getByText("No metadata"),
    ).toBeInTheDocument();
  });
});
