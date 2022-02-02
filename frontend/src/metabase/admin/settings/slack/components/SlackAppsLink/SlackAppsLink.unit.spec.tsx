import React from "react";
import { render, screen } from "@testing-library/react";
import SlackAppsLink from "./SlackAppsLink";

describe("SlackAppsLink", () => {
  it("renders correctly", () => {
    render(<SlackAppsLink />);

    expect(screen.getByText("Open Slack Apps")).toBeInTheDocument();
  });
});
