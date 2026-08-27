import { renderWithProviders, screen } from "__support__/ui";

import { CopyLinkButton } from "./CopyLinkButton";

describe("CopyLinkButton", () => {
  // The label needs an element of its own to share the grid cell with the hidden
  // pseudo-elements that reserve the button width. A bare text node becomes an
  // anonymous grid item, which lands on a second row inside the fixed-height button.
  it("should wrap the label in an element nested in the width-reserving span", () => {
    renderWithProviders(
      <CopyLinkButton url="http://localhost:3000/dashboard/1" />,
    );

    expect(screen.getByText("Copy link").parentElement).toHaveAttribute(
      "data-copy-label",
      "Copy link",
    );
  });
});
