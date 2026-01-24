import { renderWithProviders, screen } from "__support__/ui";

import { ListEmptyState } from "./ListEmptyState";

type SetupOpts = {
  label?: string;
};

function setup({ label = "No items found" }: SetupOpts = {}) {
  renderWithProviders(<ListEmptyState label={label} />);
}

describe("ListEmptyState", () => {
  it("should render the label", () => {
    const label = "Custom empty state message";
    setup({ label });
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
