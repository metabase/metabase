import React from "react";
import { render, screen } from "@testing-library/react";
import SyncModalContent from "./SyncModalContent";

describe("SyncModalContent", () => {
  const database = { id: 1, name: "Sample Dataset" };

  it("should render with sample dataset and xrays enabled", () => {
    render(<SyncModalContent sampleDatabase={database} xraysEnabled />);

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
  });

  it("should render with no sample dataset but with xrays enabled", () => {
    render(<SyncModalContent xraysEnabled />);

    expect(screen.getByText("Explore your Metabase")).toBeInTheDocument();
  });
});
