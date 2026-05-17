import { render, screen } from "__support__/ui-minimal";

import { ListEmptyState } from "./ListEmptyState";

type SetupOpts = {
  label?: string;
};

function setup({ label = "No items found" }: SetupOpts = {}) {
  render(<ListEmptyState label={label} />);
}

describe("ListEmptyState", () => {
  it("should render the label", () => {
    const label = "Custom empty state message";
    setup({ label });
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
