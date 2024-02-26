import { render, screen } from "@testing-library/react";

import TableBrowser from "./TableBrowser";

const DatabaseLink = () => <div />;

jest.mock("metabase/entities/databases", () => ({ Link: DatabaseLink }));

describe("TableBrowser", () => {
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
