import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { TitleSection } from "./TitleSection";

type SetupOpts = {
  label?: string;
  children?: ReactNode;
  actions?: ReactNode;
};

function setup({ label = "Default Title", children, actions }: SetupOpts = {}) {
  renderWithProviders(
    <TitleSection label={label} actions={actions}>
      {children}
    </TitleSection>,
  );
}

describe("TitleSection", () => {
  it("should render label and children", () => {
    const label = "Custom Title Label";
    const children = <div>Title section content</div>;

    setup({ label, children });

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("Title section content")).toBeInTheDocument();
  });

  it("should render the actions slot", () => {
    setup({ actions: <button>Create index</button> });

    expect(
      screen.getByRole("button", { name: "Create index" }),
    ).toBeInTheDocument();
  });
});
