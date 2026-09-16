import { renderWithProviders, screen } from "__support__/ui";

import { ColumnCount } from "./ColumnCount";

describe("ColumnCount", () => {
  it("should show a non-plural label for a table with a single field", () => {
    renderWithProviders(<ColumnCount fieldCount={1} />);

    expect(screen.getByText("1 column")).toBeInTheDocument();
  });

  it("should show a plural label for a table with multiple fields", () => {
    renderWithProviders(<ColumnCount fieldCount={2} />);

    expect(screen.getByText("2 columns")).toBeInTheDocument();
  });

  it("should show a plural label for a table with no fields", () => {
    renderWithProviders(<ColumnCount fieldCount={0} />);

    expect(screen.getByText("0 columns")).toBeInTheDocument();
  });
});
