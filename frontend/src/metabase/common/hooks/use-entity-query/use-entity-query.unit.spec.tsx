import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";
import type Database from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import type { DatabaseId, TableId } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { useEntityQuery } from "./use-entity-query";

const TEST_DB = createMockDatabase();
const TEST_TABLE = createMockTable();

const TestComponent = () => {
  const {
    data: database,
    isLoading,
    error,
  } = useEntityQuery<DatabaseId, Database>(
    {
      id: TEST_DB.id,
    },
    {
      fetch: Databases.actions.fetch,
      getObject: Databases.selectors.getObject,
      getLoading: Databases.selectors.getLoading,
      getError: Databases.selectors.getError,
    },
  );

  if (isLoading || error || !database) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      <div>{database.name}</div>
      <TestInnerComponent />
    </div>
  );
};

const TestInnerComponent = () => {
  const {
    data: table,
    isLoading,
    error,
  } = useEntityQuery<TableId, Table>(
    {
      id: TEST_TABLE.id,
      reload: true,
    },
    {
      fetch: Tables.actions.fetch,
      getObject: Tables.selectors.getObject,
      getLoading: Tables.selectors.getLoading,
      getError: Tables.selectors.getError,
    },
  );

  if (isLoading || error || !table) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <div>{table.name}</div>;
};

const setup = () => {
  setupDatabaseEndpoints(TEST_DB);
  setupTableEndpoints(TEST_TABLE);
  return renderWithProviders(<TestComponent />);
};

describe("useEntityQuery", () => {
  it("should be initially loading", () => {
    setup();

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should initially load data only once the reload flag", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(fetchMock.calls(`path:/api/database/${TEST_DB.id}`)).toHaveLength(1);
    expect(fetchMock.calls(`path:/api/table/${TEST_TABLE.id}`)).toHaveLength(1);
  });

  it("should not reload data when re-rendered", async () => {
    const { rerender } = setup();

    await waitForLoaderToBeRemoved();
    rerender(<TestComponent />);

    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(fetchMock.calls(`path:/api/database/${TEST_DB.id}`)).toHaveLength(1);
    expect(fetchMock.calls(`path:/api/table/${TEST_TABLE.id}`)).toHaveLength(1);
  });

  it("should reload data only for calls with the reload flag when re-mounted", async () => {
    const { rerender } = setup();

    await waitForLoaderToBeRemoved();
    rerender(<div />);
    rerender(<TestComponent />);
    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(fetchMock.calls(`path:/api/database/${TEST_DB.id}`)).toHaveLength(1);
    expect(fetchMock.calls(`path:/api/table/${TEST_TABLE.id}`)).toHaveLength(2);
  });
});
