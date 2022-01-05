import React from "react";
import { render, screen } from "@testing-library/react";
import { createDatabase } from "metabase-types/api";
import DatabaseStatusLarge from "./DatabaseStatusLarge";

describe("DatabaseStatusLarge", () => {
  it("should render in-progress status", () => {
    const databases = [
      createDatabase({
        initial_sync_status: "incomplete",
      }),
      createDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusLarge databases={databases} />);

    expect(screen.getByText("Syncing…")).toBeInTheDocument();
    expect(screen.getByText("Syncing tables…")).toBeInTheDocument();
  });

  it("should render complete status", () => {
    const before = [
      createDatabase({
        id: 1,
        initial_sync_status: "incomplete",
      }),
      createDatabase({
        id: 2,
        initial_sync_status: "complete",
      }),
    ];

    const after = [
      createDatabase({
        id: 1,
        initial_sync_status: "complete",
      }),
      createDatabase({
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
      createDatabase({
        id: 1,
        initial_sync_status: "incomplete",
      }),
      createDatabase({
        id: 2,
        initial_sync_status: "complete",
      }),
    ];

    const after = [
      createDatabase({
        id: 1,
        initial_sync_status: "aborted",
      }),
      createDatabase({
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
