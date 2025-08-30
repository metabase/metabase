import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { TitleSection } from "./TitleSection";

type SetupOpts = {
  label?: string;
  rightSection?: ReactNode;
  children?: ReactNode;
};

function setup({
  label = "Default Title",
  rightSection,
  children,
}: SetupOpts = {}) {
  renderWithProviders(
    <TitleSection label={label} rightSection={rightSection}>
      {children}
    </TitleSection>,
  );
}

describe("TitleSection", () => {
  it("should render label, rightSection, and children", () => {
    const label = "Custom Title Label";
    const rightSection = <button>Action Button</button>;
    const children = <div>Title section content</div>;

    setup({ label, rightSection, children });

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Action Button" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Title section content")).toBeInTheDocument();
  });
});
