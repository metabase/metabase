import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { ExternalLink } from "./ExternalLink";

describe("ExternalLink", () => {
  it("should receive focus on tab", async () => {
    render(<ExternalLink href="/">Link</ExternalLink>);
    await userEvent.tab();

    expect(screen.getByRole("link")).toHaveFocus();
  });
});
