import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "__support__/ui";
import { AuthProvider } from "metabase/auth/types";
import PasswordPanel, { PasswordPanelProps } from "./PasswordPanel";

const NO_REDIRECT_URL_PARAM = undefined;

describe("PasswordPanel", () => {
  it("should login successfully", async () => {
    const props = getProps();
    const data = { username: "user@example.test", password: "password" };

    render(<PasswordPanel {...props} />);
    userEvent.type(screen.getByLabelText("Email address"), data.username);
    userEvent.type(screen.getByLabelText("Password"), data.password);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    });

    userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(props.onLogin).toHaveBeenCalledWith(
        { ...data, remember: true },
        NO_REDIRECT_URL_PARAM,
      );
    });
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
