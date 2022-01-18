import React from "react";
import { render, screen } from "@testing-library/react";
import SlackHelpCard from "./SlackHelpCard";

describe("SlackHelpCard", () => {
  it("should render correctly", () => {
    render(<SlackHelpCard />);

    expect(screen.getByText("Need help?")).toBeInTheDocument();
    expect(screen.getByLabelText("info icon")).toBeInTheDocument();
    expect(screen.getByLabelText("external icon")).toBeInTheDocument();
  });
});
