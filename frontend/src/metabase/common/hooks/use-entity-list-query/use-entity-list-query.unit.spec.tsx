import fetchMock from "fetch-mock";
import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { TableListQuery } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import {
  setupDatabasesEndpoints,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import Database from "metabase-lib/metadata/Database";
import Table from "metabase-lib/metadata/Table";
import { useEntityListQuery } from "./use-entity-list-query";

const TEST_DB = createMockDatabase();
const TEST_TABLE = createMockTable();

const TestComponent = () => {
  const {
    data = [],
    isLoading,
    error,
  } = useEntityListQuery<Database>(
    {},
    {
      fetchList: Databases.actions.fetchList,
      getList: Databases.selectors.getList,
      getLoading: Databases.selectors.getLoading,
      getLoaded: Databases.selectors.getLoaded,
      getError: Databases.selectors.getError,
    },
  );

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      <div>
        {data.map(database => (
          <div key={database.id}>{database.name}</div>
        ))}
      </div>
      <TestInnerComponent />
    </div>
  );
};

const TestInnerComponent = () => {
  const {
    data = [],
    isLoading,
    error,
  } = useEntityListQuery<Table, TableListQuery>(
    {
      reload: true,
    },
    {
      fetchList: Tables.actions.fetchList,
      getList: Tables.selectors.getList,
      getLoading: Tables.selectors.getLoading,
      getLoaded: Tables.selectors.getLoaded,
      getError: Tables.selectors.getError,
    },
  );

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(table => (
        <div key={table.id}>{table.name}</div>
      ))}
    </div>
  );
};

const setup = () => {
  setupDatabasesEndpoints([TEST_DB]);
  setupTablesEndpoints([TEST_TABLE]);
  return renderWithProviders(<TestComponent />);
};

describe("useTableListQuery", () => {
  it("should be initially loading", () => {
    setup();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should initially load data only once the reload flag", async () => {
    setup();

    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));

    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(fetchMock.calls("path:/api/database")).toHaveLength(1);
    expect(fetchMock.calls("path:/api/table")).toHaveLength(1);
  });

  it("should not reload data when re-rendered", async () => {
    const { rerender } = setup();

    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    rerender(<TestComponent />);

    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(fetchMock.calls("path:/api/database")).toHaveLength(1);
    expect(fetchMock.calls("path:/api/table")).toHaveLength(1);
  });

  it("should reload data only for calls with the reload flag when re-mounted", async () => {
    const { rerender } = setup();

    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    rerender(<div />);
    rerender(<TestComponent />);
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));

    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(fetchMock.calls("path:/api/database")).toHaveLength(1);
    expect(fetchMock.calls("path:/api/table")).toHaveLength(2);
  });
});
