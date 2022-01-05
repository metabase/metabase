import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockDatabase } from "metabase-types/api/mocks";
import DatabaseStatusSmall from "./DatabaseStatusSmall";

describe("DatabaseStatusSmall", () => {
  it("should render in-progress status", () => {
    const databases = [
      createMockDatabase({
        initial_sync_status: "incomplete",
      }),
      createMockDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusSmall databases={databases} />);

    expect(screen.getByLabelText("Syncing database…")).toBeInTheDocument();
  });

  it("should render complete status", () => {
    const databases = [
      createMockDatabase({
        initial_sync_status: "complete",
      }),
      createMockDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusSmall databases={databases} />);

    expect(screen.getByLabelText("Done!")).toBeInTheDocument();
  });

  it("should render error status", () => {
    const databases = [
      createMockDatabase({
        initial_sync_status: "aborted",
      }),
      createMockDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusSmall databases={databases} />);

    expect(screen.getByLabelText("Error syncing")).toBeInTheDocument();
  });
});
