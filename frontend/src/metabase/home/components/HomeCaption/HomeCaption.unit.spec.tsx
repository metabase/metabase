import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import { HomeCaption } from "./HomeCaption";

const setup = () => {
  renderWithProviders(<HomeCaption>Title</HomeCaption>);
};

describe("HomeCaption", () => {
  it("should render correctly", () => {
    setup();
    expect(screen.getByText("Title")).toBeInTheDocument();
  });
});
