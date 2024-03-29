import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabasesEndpoints,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";
import { delay } from "metabase/lib/promise";
import { useDispatch } from "metabase/lib/redux";
import type Database from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import type { TableListQuery } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { useEntityListQuery } from "./use-entity-list-query";

const TEST_DB = createMockDatabase();
const TEST_TABLE = createMockTable();

const TestComponent = ({ testId }: { testId?: string }) => {
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
      getListMetadata: Databases.selectors.getListMetadata,
    },
  );

  const dispatch = useDispatch();
  const handleInvalidate = () => dispatch(Databases.actions.invalidateLists());

  if (isLoading || error) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error}
        data-testid={testId}
      />
    );
  }

  return (
    <div data-testid={testId}>
      <button onClick={handleInvalidate}>Invalidate databases</button>
      {data.map(database => (
        <div key={database.id}>{database.name}</div>
      ))}
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
      getListMetadata: Tables.selectors.getListMetadata,
    },
  );

  const dispatch = useDispatch();
  const handleInvalidate = () => dispatch(Tables.actions.invalidateLists());

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      <button onClick={handleInvalidate}>Invalidate tables</button>
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

describe("useEntityListQuery", () => {
  it("should be initially loading", () => {
    setup();

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should initially load data only once the reload flag in a nested component tree", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(fetchMock.calls("path:/api/database")).toHaveLength(1);
    expect(fetchMock.calls("path:/api/table")).toHaveLength(1);
  });

  it("should not reload data when re-rendered", async () => {
    const { rerender } = setup();

    await waitForLoaderToBeRemoved();
    rerender(<TestComponent />);

    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(fetchMock.calls("path:/api/database")).toHaveLength(1);
    expect(fetchMock.calls("path:/api/table")).toHaveLength(1);
  });

  it("should reload data only for calls with the reload flag when re-mounted", async () => {
    const { rerender } = setup();

    await waitForLoaderToBeRemoved();
    rerender(<div />);
    rerender(<TestComponent />);
    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(fetchMock.calls("path:/api/database")).toHaveLength(1);
    expect(fetchMock.calls("path:/api/table")).toHaveLength(2);
  });

  it("should reload data when the reload flag is off and it is explicitly invalidated", async () => {
    setup();

    await waitForLoaderToBeRemoved();
    await userEvent.click(screen.getByText("Invalidate databases"));

    await waitFor(() => {
      expect(fetchMock.calls("path:/api/database")).toHaveLength(2);
    });
    expect(await screen.findByText(TEST_DB.name)).toBeInTheDocument();
  });

  it("should reload data when the reload flag is on and it is explicitly invalidated", async () => {
    setup();

    await waitForLoaderToBeRemoved();
    await userEvent.click(screen.getByText("Invalidate tables"));

    await waitFor(() => {
      expect(fetchMock.calls("path:/api/table")).toHaveLength(2);
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
  });

  it("should not remove loader in case second api call is cached", async () => {
    fetchMock.get(
      "path:/api/database",
      delay(100).then(() => {
        return [TEST_DB];
      }),
      { overwriteRoutes: true },
    );

    const { rerender } = setup();

    expect(fetchMock.calls("path:/api/database")).toHaveLength(1);

    rerender(
      <>
        <TestComponent />
        <TestComponent testId="test2" />
      </>,
    );

    // second component should not create extra request, make sure that caching works as expected
    expect(fetchMock.calls("path:/api/database")).toHaveLength(1);

    expect(
      within(screen.getByTestId("test2")).getByTestId("loading-spinner"),
    ).toBeInTheDocument();

    await delay(100); // trigger fetch request to be resolved

    await delay(0); // trigger extra event loop to make sure React state has been updated

    expect(fetchMock.calls("path:/api/database")).toHaveLength(1);
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });
});
