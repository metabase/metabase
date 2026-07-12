import { render, screen } from "__support__/ui";

import { WidthBound } from "./Popover.styled";

describe("WidthBound (metabase#50731)", () => {
  it("constrains the popover with max-width so its content can shrink below the target width", () => {
    render(<WidthBound width={300} data-testid="width-bound" />);

    const element = screen.getByTestId("width-bound");

    // The fix for #50731 switched from a fixed `width` to a `max-width`.
    // A fixed width forces the popover to stay that wide even when less space
    // is available, causing its content to overflow. A max-width lets it shrink.
    expect(element).toHaveStyle({ maxWidth: "300px" });
    expect(element).not.toHaveStyle({ width: "300px" });
  });

  it("falls back to a 300px max-width when no width is provided", () => {
    render(<WidthBound data-testid="width-bound" />);

    const element = screen.getByTestId("width-bound");

    expect(element).toHaveStyle({ maxWidth: "300px" });
    expect(element).not.toHaveStyle({ width: "300px" });
  });
});
