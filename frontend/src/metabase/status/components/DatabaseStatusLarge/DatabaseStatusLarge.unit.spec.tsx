import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockDatabase } from "metabase-types/api/mocks";
import DatabaseStatusLarge from "./DatabaseStatusLarge";

describe("DatabaseStatusLarge", () => {
  it("should render in-progress status", () => {
    const databases = [
      createMockDatabase({
        initial_sync_status: "incomplete",
      }),
      createMockDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusLarge databases={databases} />);

    expect(screen.getByText("Syncing…")).toBeInTheDocument();
    expect(screen.getByText("Syncing tables…")).toBeInTheDocument();
  });

  it("should render complete status", () => {
    const before = [
      createMockDatabase({
        id: 1,
        initial_sync_status: "incomplete",
      }),
      createMockDatabase({
        id: 2,
        initial_sync_status: "complete",
      }),
    ];

    const after = [
      createMockDatabase({
        id: 1,
        initial_sync_status: "complete",
      }),
      createMockDatabase({
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
      createMockDatabase({
        id: 1,
        initial_sync_status: "incomplete",
      }),
      createMockDatabase({
        id: 2,
        initial_sync_status: "complete",
      }),
    ];

    const after = [
      createMockDatabase({
        id: 1,
        initial_sync_status: "aborted",
      }),
      createMockDatabase({
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
