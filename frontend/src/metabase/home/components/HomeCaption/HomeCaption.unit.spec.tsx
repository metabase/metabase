import React from "react";
import { render, screen } from "@testing-library/react";
import { HomeCaption } from "./HomeCaption";

describe("HomeCaption", () => {
  it("should render correctly", () => {
    render(<HomeCaption>Title</HomeCaption>);

    expect(screen.getByText("Title")).toBeInTheDocument();
  });
});
