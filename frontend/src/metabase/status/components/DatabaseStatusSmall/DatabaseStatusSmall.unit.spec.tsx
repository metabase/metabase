import React from "react";
import { render, screen } from "@testing-library/react";
import DatabaseStatusSmall from "./DatabaseStatusSmall";
import { Database } from "../../types";

describe("DatabaseStatusSmall", () => {
  it("should render in-progress status", () => {
    const databases = [
      getDatabase({
        initial_sync_status: "incomplete",
        tables: [
          { id: 1, initial_sync_status: "complete" },
          { id: 2, initial_sync_status: "incomplete" },
          { id: 3, initial_sync_status: "aborted" },
          { id: 4, initial_sync_status: "incomplete" },
        ],
      }),
      getDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusSmall databases={databases} />);

    expect(screen.getByLabelText("Syncing database…")).toBeInTheDocument();
  });

  it("should render complete status", () => {
    const databases = [
      getDatabase({
        initial_sync_status: "complete",
      }),
      getDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusSmall databases={databases} />);

    expect(screen.getByLabelText("Done!")).toBeInTheDocument();
  });

  it("should render error status", () => {
    const databases = [
      getDatabase({
        initial_sync_status: "aborted",
      }),
      getDatabase({
        initial_sync_status: "complete",
      }),
    ];

    render(<DatabaseStatusSmall databases={databases} />);

    expect(screen.getByLabelText("Error syncing")).toBeInTheDocument();
  });
});

const getDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Our database",
  is_sample: false,
  initial_sync_status: "complete",
  ...opts,
});
