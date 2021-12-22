import React from "react";
import { render, screen } from "@testing-library/react";
import SyncingModal from "./SyncingModal";

describe("SyncingModal", () => {
  it("should render with a table from the sample dataset", () => {
    render(<SyncingModal sampleUrl={"/auto/table/1"} />);

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
  });

  it("should render with no sample dataset", () => {
    render(<SyncingModal />);

    expect(screen.getByText("Explore your Metabase")).toBeInTheDocument();
  });
});
