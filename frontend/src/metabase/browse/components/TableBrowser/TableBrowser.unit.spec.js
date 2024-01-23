import { render, screen } from "@testing-library/react";
import fetchMock from "fetch-mock";
import {
  renderWithProviders,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { RELOAD_INTERVAL } from "../../constants";
import TableBrowser from "./TableBrowser";

const DatabaseLink = () => <div />;

jest.mock("metabase/entities/databases", () => ({ Link: DatabaseLink }));

describe("TableBrowser", () => {
  it("should poll until tables have completed initial sync", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    // initially, initial_sync_status='incomplete'
    fetchMock.get("path:/api/database/1/schema/public", [
      { id: 123, name: "foo", initial_sync_status: "incomplete" },
    ]);
    fetchMock.get("path:/api/database/1", [
      { id: 123, name: "bar", initial_sync_status: "complete" },
    ]);
    renderWithProviders(<TableBrowser dbId={1} schemaName="public" />);
    await waitFor(() => {
      expect(screen.getByText("foo")).toBeInTheDocument();
    });
    // check only one call has been made
    const calls = fetchMock.calls(/\/api\/database\/1\/schema\/public/);
    expect(calls.length).toBe(1);
    // check the loading spinner is present
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    // change the table to have initial_sync_status='complete'
    fetchMock.get(
      "path:/api/database/1/schema/public",
      [{ id: 123, name: "foo", initial_sync_status: "complete" }],
      { overwriteRoutes: true },
    );
    // advance the timer
    jest.advanceTimersByTime(RELOAD_INTERVAL);
    // wait for the response
    const calls2 = fetchMock.calls(/\/api\/database\/1\/schema\/public/);
    expect(calls2.length).toBe(2);
    await waitForLoaderToBeRemoved();
  });

  it("should render synced tables", () => {
    const tables = [
      getTable({ id: 1, name: "Orders", initial_sync_status: "complete" }),
    ];

    render(
      <TableBrowser
        tables={tables}
        getTableUrl={getTableUrl}
        xraysEnabled={true}
      />,
    );

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByLabelText("bolt_filled icon")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  it.each(["incomplete", "complete"])(
    "should render syncing tables, regardless of the database's initial_sync_status",
    initial_sync_status => {
      const database = getDatabase({ initial_sync_status });

      const tables = [
        getTable({ id: 1, name: "Orders", initial_sync_status: "incomplete" }),
      ];

      render(
        <TableBrowser
          database={database}
          tables={tables}
          getTableUrl={getTableUrl}
          xraysEnabled={true}
        />,
      );

      expect(screen.getByText("Orders")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("bolt_filled icon"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    },
  );

  it("should render tables with a sync error", () => {
    const database = getDatabase({
      initial_sync_status: "incomplete",
    });

    const tables = [
      getTable({ id: 1, name: "Orders", initial_sync_status: "aborted" }),
    ];

    render(
      <TableBrowser
        database={database}
        tables={tables}
        getTableUrl={getTableUrl}
        xraysEnabled={true}
      />,
    );

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByLabelText("bolt_filled icon")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });
});

const getDatabase = ({ id, name, initial_sync_status }) => ({
  id,
  name,
  initial_sync_status,
});

const getTable = ({ id, name, initial_sync_status }) => ({
  id,
  name,
  initial_sync_status,
});

const getTableUrl = table => {
  return `/question/${table.id}`;
};
