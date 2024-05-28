import { render, screen } from "@testing-library/react";

import ListSearchField from "./ListSearchField";

describe("ListSearchField", () => {
  it("should render", async () => {
    render(<ListSearchField autoFocus type="number" foo />);
    expect(screen.getByTestId("list-search-field")).toBeInTheDocument();
  });

  it("should have focused the input field", () => {
    render(<ListSearchField autoFocus type="number" foo />);
    expect(screen.getByTestId("list-search-field")).toHaveFocus();
  });

  it("should pass through any additional input properties", () => {
    render(<ListSearchField autoFocus type="number" foo />);
    expect(screen.getByTestId("list-search-field")).toHaveAttribute(
      "type",
      "number",
    );
  });
});
