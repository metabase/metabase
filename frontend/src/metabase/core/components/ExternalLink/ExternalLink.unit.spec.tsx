import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExternalLink from "./ExternalLink";

describe("ExternalLink", () => {
  it("should receive focus on tab", () => {
    render(<ExternalLink href="/">Link</ExternalLink>);
    userEvent.tab();

    expect(screen.getByRole("link")).toHaveFocus();
  });
});
