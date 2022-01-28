import React from "react";
import { render, screen } from "@testing-library/react";
import SlackAppsButton from "./SlackAppsButton";

describe("SlackAppsButton", () => {
  it("renders correctly", () => {
    render(<SlackAppsButton />);

    expect(screen.getByText("Open Slack Apps")).toBeInTheDocument();
  });
});
