import React from "react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockDatabase } from "metabase-types/api/mocks";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { useDatabaseQuery } from "./use-database-query";

const TEST_DATABASE = createMockDatabase();

const TestComponent = () => {
  const { data, isLoading, error } = useDatabaseQuery({
    id: TEST_DATABASE.id,
  });

  if (isLoading || error || !data) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <div>{data.name}</div>;
};

const setup = () => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  renderWithProviders(<TestComponent />);
};

describe("useDatabaseQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_DATABASE.name)).toBeInTheDocument();
  });
});
