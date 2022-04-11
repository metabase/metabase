import React from "react";
import { render, screen } from "@testing-library/react";
import Auth from "./Auth";

describe("Auth", () => {
  it("should render content", () => {
    render(<Auth>Content</Auth>);

    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
