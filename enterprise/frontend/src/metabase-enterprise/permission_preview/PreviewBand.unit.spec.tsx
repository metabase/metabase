import { renderWithProviders, screen } from "__support__/ui";

import { ExplainAccessButton } from "./PreviewBand";

jest.mock("./PreviewBand.module.css", () => ({ bandButton: "bandButton" }));

type SetupOpts = {
  isOpen: boolean;
  isCompact: boolean;
};

function setup({ isOpen, isCompact }: SetupOpts) {
  renderWithProviders(
    <ExplainAccessButton
      isOpen={isOpen}
      isCompact={isCompact}
      onClick={jest.fn()}
    />,
  );
  return screen.getByRole("button", { name: "Explain access" });
}

describe("ExplainAccessButton", () => {
  it.each([
    { isOpen: false, isCompact: false, variant: "default" },
    { isOpen: true, isCompact: false, variant: "light" },
    { isOpen: false, isCompact: true, variant: "default" },
    { isOpen: true, isCompact: true, variant: "light" },
  ])(
    "is a $variant button when isOpen is $isOpen and isCompact is $isCompact",
    ({ isOpen, isCompact, variant }) => {
      expect(setup({ isOpen, isCompact })).toHaveAttribute(
        "data-variant",
        variant,
      );
    },
  );

  it.each([
    { isCompact: false, size: "full" },
    { isCompact: true, size: "compact" },
  ])(
    "carries the band button class that keeps it white under its tints, in the $size button",
    ({ isCompact }) => {
      expect(setup({ isOpen: false, isCompact })).toHaveClass("bandButton");
    },
  );
});
