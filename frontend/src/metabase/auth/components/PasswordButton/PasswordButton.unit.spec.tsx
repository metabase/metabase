import React from "react";
import { render, screen } from "@testing-library/react";
import PasswordButton, { PasswordButtonProps } from "./PasswordButton";

describe("PasswordButton", () => {
  it("should render the login button", () => {
    const props = getProps();
    render(<PasswordButton {...props} />);

    expect(screen.getByText("Sign in with email")).toBeInTheDocument();
  });

  it("should render the login button when ldap is enabled", () => {
    const props = getProps({ isLdapEnabled: true });
    render(<PasswordButton {...props} />);

    expect(
      screen.getByText("Sign in with username or email"),
    ).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<PasswordButtonProps>,
): PasswordButtonProps => ({
  isLdapEnabled: false,
  ...opts,
});
