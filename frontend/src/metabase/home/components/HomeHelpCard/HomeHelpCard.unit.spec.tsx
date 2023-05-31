import React from "react";
import { render, screen } from "@testing-library/react";
import { HomeHelpCard } from "./HomeHelpCard";

describe("HomeHelpCard", () => {
  it("should render correctly", () => {
    render(<HomeHelpCard />);

    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });
});
