import React from "react";
import { render, screen } from "@testing-library/react";
import SyncDatabaseModal from "./SyncDatabaseModal";
import { Database } from "../../types";

describe("SyncDatabaseModal", () => {
  it("should render with sample dataset and xrays enabled", () => {
    const database = getDatabase();
    const onClose = jest.fn();

    render(
      <SyncDatabaseModal
        sampleDatabase={database}
        showXrays
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
  });

  it("should render with no sample dataset but with xrays enabled", () => {
    const onClose = jest.fn();

    render(<SyncDatabaseModal showXrays onClose={onClose} />);

    expect(screen.getByText("Explore your Metabase")).toBeInTheDocument();
  });
});

const getDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Our database",
  ...opts,
});
