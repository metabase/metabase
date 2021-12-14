import React from "react";
import { render, screen } from "@testing-library/react";
import { Database } from "../../types";
import DatabaseStatusSmall from "./DatabaseStatusSmall";

describe("DatabaseStatusSmall", () => {
  it("should render in-progress status", () => {
    const database = getDatabase({
      initial_sync_status: "incomplete",
      tables: [
        { id: 1, initial_sync_status: "complete" },
        { id: 2, initial_sync_status: "incomplete" },
        { id: 3, initial_sync_status: "aborted" },
        { id: 4, initial_sync_status: "incomplete" },
      ],
    });

    render(<DatabaseStatusSmall databases={[database]} />);

    expect(screen.getByLabelText("Syncing database…")).toBeInTheDocument();
  });

  it("should render complete status", () => {
    const database = getDatabase({
      initial_sync_status: "complete",
    });

    render(<DatabaseStatusSmall databases={[database]} />);

    expect(screen.getByLabelText("Done!")).toBeInTheDocument();
  });

  it("should render error status", () => {
    const database = getDatabase({
      initial_sync_status: "aborted",
    });

    render(<DatabaseStatusSmall databases={[database]} />);

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
