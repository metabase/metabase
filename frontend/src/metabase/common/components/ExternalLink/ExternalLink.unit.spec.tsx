import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";

import { ButtonLink, ExternalLink } from "./ExternalLink";

describe("ExternalLink", () => {
  it("should receive focus on tab", async () => {
    render(<ExternalLink href="/">Link</ExternalLink>);
    await userEvent.tab();

    expect(screen.getByRole("link")).toHaveFocus();
  });
});

describe("ButtonLink", () => {
  it("should open an external url in a new tab, with an external link icon after the label", () => {
    render(
      <ButtonLink href="https://store.metabase.com/">
        Go to the store
      </ButtonLink>,
    );

    const link = screen.getByRole("link", { name: "Go to the store" });
    expect(link).toHaveAttribute("href", "https://store.metabase.com/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(link).getByLabelText("external icon")).toBeInTheDocument();
  });
});
