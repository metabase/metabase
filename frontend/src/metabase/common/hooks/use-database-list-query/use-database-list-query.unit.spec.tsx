import React from "react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockDatabase } from "metabase-types/api/mocks";
import {
  setupDatabasesEndpoints,
  setupUnauthorizedDatabasesEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import useDatabaseListQuery from "./use-database-list-query";

const TEST_DB = createMockDatabase();

const TestComponent = () => {
  const { databases = [], isLoading, error } = useDatabaseListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {databases.map(database => (
        <div key={database.id}>{database.name}</div>
      ))}
    </div>
  );
};

interface SetupOpts {
  hasDataAccess?: boolean;
}

const setup = ({ hasDataAccess = true }: SetupOpts = {}) => {
  if (hasDataAccess) {
    setupDatabasesEndpoints([TEST_DB]);
  } else {
    setupUnauthorizedDatabasesEndpoints([TEST_DB]);
  }

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
});
