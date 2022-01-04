import React from "react";
import { render, screen } from "@testing-library/react";
import { createDatabase } from "metabase-types/api/database";
import DatabaseStatusSmall from "./DatabaseStatusSmall";

describe("DatabaseStatusSmall", () => {
  it("should render in-progress status", () => {
    const databases = [
      createDatabase({
        initial_sync_status: "incomplete",
      }),
      createDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusSmall databases={databases} />);

    expect(screen.getByLabelText("Syncing database…")).toBeInTheDocument();
  });

  it("should render complete status", () => {
    const databases = [
      createDatabase({
        initial_sync_status: "complete",
      }),
      createDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusSmall databases={databases} />);

    expect(screen.getByLabelText("Done!")).toBeInTheDocument();
  });

  it("should render error status", () => {
    const databases = [
      createDatabase({
        initial_sync_status: "aborted",
      }),
      createDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusSmall databases={databases} />);

    expect(screen.getByLabelText("Error syncing")).toBeInTheDocument();
  });
});
