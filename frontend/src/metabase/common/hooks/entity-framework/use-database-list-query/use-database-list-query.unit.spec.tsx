import { setupDatabasesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import Loading from "metabase/components/Loading";
import { unready } from "metabase/components/Loading/utils";
import { createMockDatabase } from "metabase-types/api/mocks";

import { useDatabaseListQuery } from "./use-database-list-query";

const TEST_DB = createMockDatabase();

const TestComponent = () => {
  const { data = [], ...result } = useDatabaseListQuery();

  if (unready(result)) {
    return <Loading result={result} />;
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
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
  });
});
