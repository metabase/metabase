import React from "react";
import { render, screen } from "@testing-library/react";
import { SyncModal } from "./SyncModal";

describe("SyncModal", () => {
  const database = { id: 1, name: "Sample Dataset" };

  it("should render with sample dataset and xrays enabled", () => {
    render(<SyncModal sampleDatabase={database} xraysEnabled />);

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
  });

  it("should render with no sample dataset but with xrays enabled", () => {
    render(<SyncModal xraysEnabled />);

    expect(screen.getByText("Explore your Metabase")).toBeInTheDocument();
  });
});
