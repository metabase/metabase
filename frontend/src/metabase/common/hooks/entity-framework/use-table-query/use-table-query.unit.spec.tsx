import { setupTablesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockTable } from "metabase-types/api/mocks";

import { useTableQuery } from "./use-table-query";

const TEST_TABLE = createMockTable();

const TestComponent = () => {
  const { data, isLoading, error } = useTableQuery({
    id: TEST_TABLE.id,
  });

  if (isLoading || error || !data) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <div>{data.name}</div>;
};

const setup = () => {
  setupTablesEndpoints([TEST_TABLE]);
  renderWithProviders(<TestComponent />);
};

describe("useTableQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
  });
});
