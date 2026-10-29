import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { ListEmptyState } from "./ListEmptyState";

type SetupOpts = {
  label?: string;
  description?: string;
  action?: ReactNode;
};

function setup({
  label = "No items found",
  description,
  action,
}: SetupOpts = {}) {
  renderWithProviders(
    <ListEmptyState label={label} description={description} action={action} />,
  );
}

describe("ListEmptyState", () => {
  it("should render the label", () => {
    const label = "Custom empty state message";
    setup({ label });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("should render a description and an action under the label", () => {
    setup({
      description: "Add one to get started.",
      action: <button>Add item</button>,
    });
    expect(screen.getByText("Add one to get started.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add item" }),
    ).toBeInTheDocument();
  });
});
