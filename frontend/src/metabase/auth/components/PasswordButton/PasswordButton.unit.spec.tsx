import React from "react";
import { render, screen } from "@testing-library/react";
import PasswordButton from "./PasswordButton";

describe("PasswordButton", () => {
  it("should render a login button", () => {
    render(<PasswordButton />);

    expect(screen.getByText("Sign in with email")).toBeInTheDocument();
  });
});
