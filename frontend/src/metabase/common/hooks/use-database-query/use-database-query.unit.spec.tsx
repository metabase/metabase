import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockDatabase } from "metabase-types/api/mocks";
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

  it("should show error from the response", async () => {
    setup({ hasDataAccess: false });
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(PERMISSION_ERROR)).toBeInTheDocument();
  });
});
