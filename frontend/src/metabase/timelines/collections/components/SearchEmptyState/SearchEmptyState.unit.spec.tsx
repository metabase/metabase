import { render, screen } from "@testing-library/react";

import SearchEmptyState from "./SearchEmptyState";

describe("SearchEmptyState", () => {
  it("should render correctly", () => {
    render(<SearchEmptyState />);

    expect(screen.getByLabelText("star icon")).toBeInTheDocument();
  });
});
