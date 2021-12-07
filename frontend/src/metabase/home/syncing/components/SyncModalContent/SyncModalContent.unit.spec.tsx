import React from "react";
import { render, screen } from "@testing-library/react";
import SyncModalContent from "./SyncModalContent";
import { Database } from "../../types";

describe("SyncModalContent", () => {
  it("should render with sample dataset and xrays enabled", () => {
    const database = getDatabase();

    render(<SyncModalContent sampleDatabase={database} showXrays />);

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
  });

  it("should render with no sample dataset but with xrays enabled", () => {
    render(<SyncModalContent showXrays />);

    expect(screen.getByText("Explore your Metabase")).toBeInTheDocument();
  });
});

const getDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Our database",
  is_sample: false,
  initial_sync_status: "complete",
  tables: [],
  ...opts,
});
