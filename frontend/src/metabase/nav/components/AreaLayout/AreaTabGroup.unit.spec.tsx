import { renderWithProviders, screen } from "__support__/ui";

import { AreaTabGroup } from "./AreaTabGroup";

const setup = ({ showLabel = true }: { showLabel?: boolean } = {}) => {
  renderWithProviders(
    <AreaTabGroup label="Content management" showLabel={showLabel}>
      <div data-testid="child">{"Child item"}</div>
    </AreaTabGroup>,
  );
};

describe("AreaTabGroup", () => {
  it("renders a static heading with its children always visible", () => {
    setup();

    expect(
      screen.getByRole("heading", { name: "Content management" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeVisible();
  });

  it("is not interactive", () => {
    setup();

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides the heading in icon-only mode while keeping children visible and the section labelled", () => {
    setup({ showLabel: false });

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Content management" }),
    ).toBeInTheDocument();
  });
});
