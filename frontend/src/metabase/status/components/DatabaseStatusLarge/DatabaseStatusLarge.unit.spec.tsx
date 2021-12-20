import React from "react";
import { render, screen } from "@testing-library/react";
import DatabaseStatusLarge from "./DatabaseStatusLarge";
import { Database } from "../../types";

describe("DatabaseStatusLarge", () => {
  it("should render in-progress status", () => {
    const databases = [
      getDatabase({
        initial_sync_status: "incomplete",
      }),
      getDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusLarge databases={databases} />);

    expect(screen.getByText("Syncing…")).toBeInTheDocument();
    expect(screen.getByText("Syncing tables…")).toBeInTheDocument();
  });

  it("should render complete status", () => {
    const before = [
      getDatabase({
        id: 1,
        initial_sync_status: "incomplete",
      }),
      getDatabase({
        id: 2,
        initial_sync_status: "complete",
      }),
    ];

    const after = [
      getDatabase({
        id: 1,
        initial_sync_status: "complete",
      }),
      getDatabase({
        id: 2,
        initial_sync_status: "complete",
      }),
    ];

    const { rerender } = render(<DatabaseStatusLarge databases={before} />);
    rerender(<DatabaseStatusLarge databases={after} />);

    expect(screen.getByText("Done!")).toBeInTheDocument();
    expect(screen.getByText("Syncing completed")).toBeInTheDocument();
  });

  it("should render error status", () => {
    const before = [
      getDatabase({
        id: 1,
        initial_sync_status: "incomplete",
      }),
      getDatabase({
        id: 2,
        initial_sync_status: "complete",
      }),
    ];

    const after = [
      getDatabase({
        id: 1,
        initial_sync_status: "aborted",
      }),
      getDatabase({
        id: 2,
        initial_sync_status: "complete",
      }),
    ];

    const { rerender } = render(<DatabaseStatusLarge databases={before} />);
    rerender(<DatabaseStatusLarge databases={after} />);

    expect(screen.getByText("Error syncing")).toBeInTheDocument();
    expect(screen.getByText("Sync failed")).toBeInTheDocument();
  });
});

const getDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Our database",
  is_sample: false,
  initial_sync_status: "complete",
  ...opts,
});
