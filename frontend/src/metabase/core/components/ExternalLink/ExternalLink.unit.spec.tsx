import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExternalLink from "./ExternalLink";

const user = userEvent.setup();

describe("ExternalLink", () => {
  it("should receive focus on tab", async () => {
    render(<ExternalLink href="/">Link</ExternalLink>);
    await user.tab();

    expect(screen.getByRole("link")).toHaveFocus();
  });
});
