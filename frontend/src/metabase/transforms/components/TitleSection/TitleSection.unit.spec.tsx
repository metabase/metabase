import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { TitleSection } from "./TitleSection";

type SetupOpts = {
  label?: string;
  children?: ReactNode;
};

function setup({ label = "Default Title", children }: SetupOpts = {}) {
  renderWithProviders(<TitleSection label={label}>{children}</TitleSection>);
}

describe("TitleSection", () => {
  it("should render label, rightSection, and children", () => {
    const label = "Custom Title Label";
    const children = <div>Title section content</div>;

    setup({ label, children });

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("Title section content")).toBeInTheDocument();
  });
});
