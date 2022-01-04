import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createDatabase } from "metabase-types/api/database";
import { createUser } from "metabase-types/api/user";
import DatabaseStatus from "./DatabaseStatus";

describe("DatabaseStatus", () => {
  it("should toggle between small and large versions", () => {
    const user = createUser({ id: 1 });
    const databases = [
      createDatabase({ creator_id: 1, initial_sync_status: "incomplete" }),
    ];

    render(<DatabaseStatus user={user} databases={databases} />);
    expect(screen.getByText("Syncing…")).toBeInTheDocument();

    userEvent.click(screen.getByLabelText("chevrondown icon"));
    expect(screen.getByLabelText("Syncing database…")).toBeInTheDocument();

    userEvent.click(screen.getByRole("status"));
    expect(screen.getByText("Syncing…")).toBeInTheDocument();
  });

  it("should not render when data is not loaded", () => {
    render(<DatabaseStatus />);

    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
  });

  it("should not render when databases are created by another user", () => {
    const user = createUser({ id: 1 });
    const databases = [
      createDatabase({ creator_id: 2, initial_sync_status: "incomplete" }),
    ];

    render(<DatabaseStatus user={user} databases={databases} />);

    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
  });
});
