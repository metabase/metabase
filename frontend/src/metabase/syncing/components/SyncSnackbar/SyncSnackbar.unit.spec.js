import React from "react";
import { render, act, screen } from "@testing-library/react";
import SyncSnackbar from "./SyncSnackbar";

describe("SyncSnackbar", () => {
  beforeEach(() => {
    jest.useFakeTimers("modern");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should initially display syncing databases only", () => {
    const databases = [
      getDatabase({ id: 1, name: "DB1", initial_sync_status: "incomplete" }),
      getDatabase({ id: 2, name: "DB2", initial_sync_status: "complete" }),
    ];

    render(<SyncSnackbar databases={databases} />);

    expect(screen.getByText("DB1")).toBeInTheDocument();
    expect(screen.queryByText("DB2")).not.toBeInTheDocument();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should display synced databases for a short time", () => {
    const databases1 = [
      getDatabase({ id: 1, name: "DB1", initial_sync_status: "complete" }),
    ];

    const databases2 = [
      getDatabase({ id: 1, name: "DB1", initial_sync_status: "complete" }),
      getDatabase({ id: 2, name: "DB2", initial_sync_status: "incomplete" }),
    ];

    const databases3 = [
      getDatabase({ id: 1, name: "DB1", initial_sync_status: "complete" }),
      getDatabase({ id: 2, name: "DB2", initial_sync_status: "complete" }),
    ];

    const { rerender } = render(<SyncSnackbar databases={databases1} />);
    rerender(<SyncSnackbar databases={databases2} />);
    rerender(<SyncSnackbar databases={databases3} />);

    expect(screen.getByText("DB2")).toBeInTheDocument();
    expect(screen.getByLabelText("check icon")).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(6000));
    expect(screen.queryByText("DB2")).not.toBeInTheDocument();
  });

  it("should display databases with a sync error for a short time", () => {
    const databases1 = [
      getDatabase({ id: 1, name: "DB1", initial_sync_status: "incomplete" }),
      getDatabase({ id: 2, name: "DB2", initial_sync_status: "complete" }),
    ];

    const databases2 = [
      getDatabase({ id: 1, name: "DB1", initial_sync_status: "aborted" }),
      getDatabase({ id: 2, name: "DB2", initial_sync_status: "complete" }),
    ];

    const { rerender } = render(<SyncSnackbar databases={databases1} />);
    rerender(<SyncSnackbar databases={databases2} />);

    expect(screen.getByText("DB1")).toBeInTheDocument();
    expect(screen.getByLabelText("warning icon")).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(6000));
    expect(screen.queryByText("DB1")).not.toBeInTheDocument();
  });
});

const getDatabase = ({ id, name, initial_sync_status, tables = [] }) => ({
  id,
  name,
  initial_sync_status,
  tables,
});
