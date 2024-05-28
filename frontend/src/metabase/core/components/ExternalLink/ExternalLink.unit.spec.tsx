import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ExternalLink from "./ExternalLink";

describe("ExternalLink", () => {
  it("should receive focus on tab", async () => {
    render(<ExternalLink href="/">Link</ExternalLink>);
    await userEvent.tab();

    expect(screen.getByRole("link")).toHaveFocus();
  });
});
