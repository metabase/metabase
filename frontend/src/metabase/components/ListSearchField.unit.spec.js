import React from "react";
import ListSearchField from "./ListSearchField";
import { render } from "@testing-library/react";

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
    expect(document.activeElement).toBe(input);
  });

  it("should pass through any additional input properties", () => {
    expect(input.getAttribute("type")).toBe("number");
  });
});
