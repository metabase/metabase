import React from "react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { useSchemaListQuery } from "./use-schema-list-query";

const TEST_TABLE = createMockTable();

const TEST_DATABASE = createMockDatabase({
  tables: [TEST_TABLE],
});

const TestComponent = () => {
  const {
    data = [],
    isLoading,
    error,
  } = useSchemaListQuery({
    query: { dbId: TEST_DATABASE.id },
  });

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(schema => (
        <div key={schema.id}>{schema.name}</div>
      ))}
    </div>
  );
};

const setup = () => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  renderWithProviders(<TestComponent />);
};

describe("useSchemaListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_TABLE.schema)).toBeInTheDocument();
  });
});
