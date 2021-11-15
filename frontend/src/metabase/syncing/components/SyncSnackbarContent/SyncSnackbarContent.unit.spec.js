import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import SyncSnackbarContent from "./SyncSnackbarContent";

describe("SyncSnackbarContent", () => {
  it("should render a syncing database", () => {
    const databases = [
      getDatabase({
        id: 1,
        name: "DB1",
        initial_sync: false,
        tables: [
          getTable({ initial_sync: false }),
          getTable({ initial_sync: true }),
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
        initial_sync: true,
        tables: [
          getTable({ initial_sync: true }),
          getTable({ initial_sync: true }),
        ],
      }),
    ];

    render(<SyncSnackbarContent databases={databases} />);

    expect(screen.getByText("Done!")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 done")).toBeInTheDocument();
    expect(screen.getByLabelText("check icon")).toBeInTheDocument();
  });

  it("should render multiple databases", () => {
    const databases = [
      getDatabase({
        id: 1,
        name: "DB1",
        initial_sync: false,
        tables: [
          getTable({ initial_sync: false }),
          getTable({ initial_sync: false }),
          getTable({ initial_sync: true }),
          getTable({ initial_sync: false }),
        ],
      }),
      getDatabase({
        id: 2,
        name: "DB2",
        initial_sync: true,
        tables: [
          getTable({ initial_sync: true }),
          getTable({ initial_sync: true }),
        ],
      }),
    ];

    render(<SyncSnackbarContent databases={databases} />);

    fireEvent.click(screen.getByLabelText("chevrondown icon"));
    expect(screen.getByText("Syncing… (25%)"));

    fireEvent.click(screen.getByLabelText("chevronup icon"));
    expect(screen.getByText("Syncing…"));
  });
});

const getDatabase = ({
  id = 1,
  name = "Database",
  initial_sync = false,
  tables = [],
}) => ({
  id,
  name,
  initial_sync,
  tables,
});

const getTable = ({ id = 1, initial_sync = false }) => ({
  id,
  initial_sync,
});
