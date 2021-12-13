import React from "react";
import { render, screen } from "@testing-library/react";
import DatabaseStatusListing from "./DatabaseStatusListing";
import { Database, User } from "../../types";

describe("DatabaseStatusListing", () => {
  it("should not render the list when data is not loaded", () => {
    render(<DatabaseStatusListing />);

    expect(screen.queryByLabelText(/syncing/i)).not.toBeInTheDocument();
  });

  it("should render databases only created by the user", () => {
    const user = getUser({ id: 1 });
    const databases = [
      getDatabase({ name: "DB1" }),
      getDatabase({ name: "DB2", creator_id: 1 }),
      getDatabase({ name: "DB2", creator_id: 2 }),
    ];

    render(<DatabaseStatusListing user={user} databases={databases} />);

    expect(screen.getByLabelText(/DB2/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/DB1/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/DB3/)).not.toBeInTheDocument();
  });
});

const getUser = (opts?: Partial<User>): User => ({
  id: 1,
  ...opts,
});

const getDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Our database",
  is_sample: false,
  initial_sync_status: "incomplete",
  ...opts,
});
