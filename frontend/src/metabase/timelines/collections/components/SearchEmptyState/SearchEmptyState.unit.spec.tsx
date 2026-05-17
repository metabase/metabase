import { render, screen } from "__support__/ui-minimal";

import SearchEmptyState from "./SearchEmptyState";

describe("SearchEmptyState", () => {
  it("should render correctly", () => {
    render(<SearchEmptyState />);

    expect(screen.getByText("No events found")).toBeInTheDocument();
  });
});
