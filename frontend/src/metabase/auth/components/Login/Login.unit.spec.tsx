import React, { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import Login from "./Login";
import { AuthProvider } from "../../types";

describe("Login", () => {
  it("should render a list of auth providers", () => {
    const providers = [
      getAuthProvider({ name: "password", Panel: AuthPanelMock }),
      getAuthProvider({ name: "google" }),
    ];

    render(<Login providers={providers} />);

    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("should render the panel of the selected provider", () => {
    const providers = [
      getAuthProvider({ name: "password", Panel: AuthPanelMock }),
      getAuthProvider({ name: "google" }),
    ];

    render(<Login providers={providers} providerName="password" />);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("should implicitly select the only provider with a panel", () => {
    const providers = [
      getAuthProvider({ name: "password", Panel: AuthPanelMock }),
    ];

    render(<Login providers={providers} />);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("should not implicitly select the only provider without a panel", () => {
    const providers = [getAuthProvider({ name: "google" })];

    render(<Login providers={providers} />);

    expect(screen.getByRole("link")).toBeInTheDocument();
  });
});

const getAuthProvider = (opts?: Partial<AuthProvider>): AuthProvider => ({
  name: "password",
  Button: AuthButtonMock,
  ...opts,
});

const AuthButtonMock = () => <a href="/">Sign in</a>;

const AuthPanelMock = () => <button>Sign in</button>;

interface AuthLayoutMockProps {
  children?: ReactNode;
}

const AuthLayoutMock = ({ children }: AuthLayoutMockProps) => {
  return <div>{children}</div>;
};

jest.mock("../../containers/AuthLayout", () => AuthLayoutMock);
