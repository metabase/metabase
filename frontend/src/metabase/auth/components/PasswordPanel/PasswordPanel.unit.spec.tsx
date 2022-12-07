import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "metabase/auth/types";
import PasswordPanel, { PasswordPanelProps } from "./PasswordPanel";

describe("PasswordPanel", () => {
  it("should login successfully", () => {
    const props = getProps();
    const data = { username: "user@example.test", password: "password" };

    render(<PasswordPanel {...props} />);
    userEvent.type(screen.getByLabelText("Email address"), data.username);
    userEvent.type(screen.getByLabelText("Password"), data.password);
    userEvent.click(screen.getByText("Sign in"));

    waitFor(() => expect(props.onLogin).toHaveBeenCalledWith(data));
  });

  it("should render a link to reset the password and a list of auth providers", () => {
    const props = getProps({ providers: [getAuthProvider()] });

    render(<PasswordPanel {...props} />);

    expect(screen.getByText(/forgotten my password/)).toBeInTheDocument();
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<PasswordPanelProps>): PasswordPanelProps => ({
  providers: [],
  isLdapEnabled: false,
  hasSessionCookies: false,
  onLogin: jest.fn(),
  ...opts,
});

const getAuthProvider = (opts?: Partial<AuthProvider>): AuthProvider => ({
  name: "google",
  Button: AuthButtonMock,
  ...opts,
});

const AuthButtonMock = () => <a href="/">Sign in with Google</a>;
