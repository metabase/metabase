import { setupDatabasesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockDatabase } from "metabase-types/api/mocks";

import { useDatabaseListQuery } from "./use-database-list-query";

const TEST_DB = createMockDatabase();

const TestComponent = () => {
  const { data = [], isLoading, error } = useDatabaseListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(database => (
        <div key={database.id}>{database.name}</div>
      ))}
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
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
  });
});
