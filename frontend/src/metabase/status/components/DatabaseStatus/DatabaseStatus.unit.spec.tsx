import React from "react";
import { render, screen } from "@testing-library/react";
import DatabaseStatus from "./DatabaseStatus";
import { Database } from "../../types";

describe("DatabaseStatus", () => {
  it("should render in progress status", () => {
    const database = getDatabase({
      name: "H2",
      initial_sync_status: "incomplete",
      tables: [
        { id: 1, initial_sync_status: "complete" },
        { id: 2, initial_sync_status: "incomplete" },
        { id: 3, initial_sync_status: "aborted" },
        { id: 4, initial_sync_status: "incomplete" },
      ],
    });

    render(<DatabaseStatus database={database} />);

    expect(screen.getByLabelText("Syncing H2 (25%)")).toBeInTheDocument();
  });

  it("should render complete status", () => {
    const database1 = getDatabase({
      name: "H2",
      initial_sync_status: "incomplete",
    });
    const database2 = getDatabase({
      ...database1,
      initial_sync_status: "complete",
    });

    const { rerender } = render(<DatabaseStatus database={database1} />);
    rerender(<DatabaseStatus database={database2} />);

    expect(screen.getByLabelText("H2 is ready!")).toBeInTheDocument();
  });

  it("should render error status", () => {
    const database1 = getDatabase({
      name: "H2",
      initial_sync_status: "incomplete",
    });
    const database2 = getDatabase({
      ...database1,
      initial_sync_status: "aborted",
    });

    const { rerender } = render(<DatabaseStatus database={database1} />);
    rerender(<DatabaseStatus database={database2} />);

    expect(screen.getByLabelText("Error syncing H2")).toBeInTheDocument();
  });
});

const getDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Our database",
  is_sample: false,
  initial_sync_status: "complete",
  ...opts,
});
