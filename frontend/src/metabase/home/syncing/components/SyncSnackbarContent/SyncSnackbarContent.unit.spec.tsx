import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SyncSnackbarContent from "./SyncSnackbarContent";
import { Table, Database } from "../../types";

describe("SyncSnackbarContent", () => {
  it("should render a syncing database", () => {
    const databases = [
      getDatabase({
        id: 1,
        name: "DB1",
        initial_sync_status: "incomplete",
        tables: [
          getTable({ initial_sync_status: "incomplete" }),
          getTable({ initial_sync_status: "complete" }),
        ],
      }),
    ];

    render(<SyncSnackbarContent databases={databases} />);

    expect(screen.getByText("Syncing…")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should render a synced database", () => {
    const databases = [
      getDatabase({
        id: 1,
        name: "DB1",
        initial_sync_status: "complete",
        tables: [
          getTable({ initial_sync_status: "complete" }),
          getTable({ initial_sync_status: "complete" }),
        ],
      }),
    ];

    render(<SyncSnackbarContent databases={databases} />);

    expect(screen.getByText("Done!")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 done")).toBeInTheDocument();
    expect(screen.getByLabelText("check icon")).toBeInTheDocument();
  });

  it("should render a database with a sync error", () => {
    const databases = [
      getDatabase({
        id: 1,
        name: "DB1",
        initial_sync_status: "aborted",
        tables: [
          getTable({ initial_sync_status: "incomplete" }),
          getTable({ initial_sync_status: "incomplete" }),
        ],
      }),
    ];

    render(<SyncSnackbarContent databases={databases} />);

    expect(screen.getByText("Error syncing")).toBeInTheDocument();
    expect(screen.getByText("Sync failed")).toBeInTheDocument();
    expect(screen.getByLabelText("warning icon")).toBeInTheDocument();
  });

  it("should render multiple databases", () => {
    const databases = [
      getDatabase({
        id: 1,
        name: "DB1",
        initial_sync_status: "incomplete",
        tables: [
          getTable({ initial_sync_status: "incomplete" }),
          getTable({ initial_sync_status: "incomplete" }),
          getTable({ initial_sync_status: "complete" }),
          getTable({ initial_sync_status: "incomplete" }),
        ],
      }),
      getDatabase({
        id: 2,
        name: "DB2",
        initial_sync_status: "complete",
        tables: [
          getTable({ initial_sync_status: "complete" }),
          getTable({ initial_sync_status: "complete" }),
        ],
      }),
    ];

    render(<SyncSnackbarContent databases={databases} />);

    fireEvent.click(screen.getByLabelText("chevrondown icon"));
    expect(screen.getByText("Syncing… (50%)"));

    fireEvent.click(screen.getByLabelText("chevronup icon"));
    expect(screen.getByText("Syncing…"));
  });
});

const getDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Our database",
  is_sample: false,
  initial_sync_status: "complete",
  tables: [],
  ...opts,
});

const getTable = (opts?: Partial<Table>): Table => ({
  id: 1,
  initial_sync_status: "complete",
  ...opts,
});
