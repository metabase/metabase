import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { SplitSection } from "./SplitSection";

type SetupOpts = {
  label?: string;
  description?: string;
  children?: ReactNode;
};

function setup({
  label = "Default Label",
  description = "Default description",
  children,
}: SetupOpts = {}) {
  renderWithProviders(
    <SplitSection label={label} description={description}>
      {children}
    </SplitSection>,
  );
}

describe("SplitSection", () => {
  it("should render label, description, and children", () => {
    const label = "Custom Section Label";
    const description = "Custom section description";
    const children = <span>Custom child content</span>;

    setup({ label, description, children });

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.getByText("Custom child content")).toBeInTheDocument();
  });
});
