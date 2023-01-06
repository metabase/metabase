import React from "react";
import { render } from "@testing-library/react";
import ListSearchField from "./ListSearchField";

describe("ListSearchField", () => {
  let input;
  beforeEach(() => {
    render(<ListSearchField autoFocus type="number" foo />);
    input = document.querySelector("input");
  });

  it("should render", async () => {
    expect(input).toBeInTheDocument();
  });

  it("should have focused the input field", () => {
    expect(input).toHaveFocus();
  });

  it("should pass through any additional input properties", () => {
    expect(input).toHaveAttribute("type", "number");
  });
});
