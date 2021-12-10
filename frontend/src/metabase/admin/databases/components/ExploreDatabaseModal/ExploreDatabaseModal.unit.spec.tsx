import React from "react";
import { render, screen } from "@testing-library/react";
import ExploreDatabaseModal from "./ExploreDatabaseModal";
import { Database } from "../../types";

describe("ExploreDatabaseModal", () => {
  it("should render with sample dataset and xrays enabled", () => {
    const database = getDatabase();
    const onClose = jest.fn();

    render(
      <ExploreDatabaseModal
        sampleDatabase={database}
        showXrays
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
  });

  it("should render with no sample dataset but with xrays enabled", () => {
    const onClose = jest.fn();

    render(<ExploreDatabaseModal showXrays onClose={onClose} />);

    expect(screen.getByText("Explore your Metabase")).toBeInTheDocument();
  });
});

const getDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Our database",
  is_sample: false,
  initial_sync_status: "complete",
  ...opts,
});
