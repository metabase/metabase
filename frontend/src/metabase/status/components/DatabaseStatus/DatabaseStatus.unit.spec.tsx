import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DatabaseStatus from "./DatabaseStatus";
import { Database } from "../../types";

describe("DatabaseStatus", () => {
  it("should toggle between small and large versions", () => {
    const databases = [getDatabase({ initial_sync_status: "incomplete" })];

    render(<DatabaseStatus databases={databases} />);
    expect(screen.getByText("Syncing…")).toBeInTheDocument();

    userEvent.click(screen.getByLabelText("chevrondown icon"));
    expect(screen.getByLabelText("Syncing database…")).toBeInTheDocument();

    userEvent.click(screen.getByRole("status"));
    expect(screen.getByText("Syncing…")).toBeInTheDocument();
  });
});

const getDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Our database",
  is_sample: false,
  initial_sync_status: "complete",
  ...opts,
});
