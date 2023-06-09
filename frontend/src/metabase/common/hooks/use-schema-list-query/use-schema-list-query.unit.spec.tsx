import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import {
  PERMISSION_ERROR,
  setupDatabasesEndpoints,
  setupUnauthorizedDatabasesEndpoints,
} from "__support__/server-mocks";
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

interface SetupOpts {
  hasDataAccess?: boolean;
}

const setup = ({ hasDataAccess = true }: SetupOpts = {}) => {
  if (hasDataAccess) {
    setupDatabasesEndpoints([TEST_DATABASE]);
  } else {
    setupUnauthorizedDatabasesEndpoints([TEST_DATABASE]);
  }

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

  it("should show error from the response", async () => {
    setup({ hasDataAccess: false });
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(PERMISSION_ERROR)).toBeInTheDocument();
  });
});
