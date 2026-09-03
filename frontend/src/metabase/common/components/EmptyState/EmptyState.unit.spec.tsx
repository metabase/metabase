import { render, screen } from "__support__/ui";

import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title as an h2 heading with polite live region", () => {
    render(
      <EmptyState
        title="Nothing to see here"
        illustrationElement={<div aria-hidden />}
      />,
    );

    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Nothing to see here",
    });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("aria-live", "polite");
  });

  it("does not render a heading when there is no title", () => {
    render(<EmptyState illustrationElement={<div aria-hidden />} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
