import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import HomeLayout from "./HomeLayout";

const setup = () => {
  renderWithProviders(<HomeLayout />);
};

describe("HomeLayout", () => {
  it("should render correctly", () => {
    setup();
    expect(screen.getByText("Hey there")).toBeInTheDocument();
  });
});
