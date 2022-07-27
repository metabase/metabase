import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";
import DatabaseStatus from "./DatabaseStatus";

const user = userEvent.setup();

const mockUser = createMockUser({ id: 1 });

describe("DatabaseStatus", () => {
  it("should toggle between small and large versions", async () => {
    const databases = [
      createMockDatabase({ creator_id: 1, initial_sync_status: "incomplete" }),
    ];

    render(<DatabaseStatus user={mockUser} databases={databases} />);
    expect(screen.getByText("Syncing…")).toBeInTheDocument();

    await user.click(screen.getByLabelText("chevrondown icon"));
    expect(screen.getByLabelText("Syncing database…")).toBeInTheDocument();

    await user.click(screen.getByRole("status"));
    expect(screen.getByText("Syncing…")).toBeInTheDocument();
  });

  it("should not render when data is not loaded", () => {
    render(<DatabaseStatus />);

    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
  });

  it("should not render when databases are created by another user", () => {
    const databases = [
      createMockDatabase({ creator_id: 2, initial_sync_status: "incomplete" }),
    ];

    render(<DatabaseStatus user={mockUser} databases={databases} />);

    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
  });
});
