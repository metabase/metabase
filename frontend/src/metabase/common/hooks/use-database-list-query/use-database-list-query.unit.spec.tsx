import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockDatabase } from "metabase-types/api/mocks";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import { useDatabaseListQuery } from "./use-database-list-query";

const TEST_DB = createMockDatabase();

const TestComponent = () => {
  const { data = [], metadata, isLoading, error } = useDatabaseListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(database => (
        <div key={database.id}>{database.name}</div>
      ))}

      <div data-testid="metadata">
        {(!metadata || Object.keys(metadata).length === 0) && "No metadata"}
      </div>
    </div>
  );
};

const setup = () => {
  setupDatabasesEndpoints([TEST_DB]);
  renderWithProviders(<TestComponent />);
};

describe("useDatabaseListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
  });

  it("should not have any metadata in the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(
      within(screen.getByTestId("metadata")).getByText("No metadata"),
    ).toBeInTheDocument();
  });
});
