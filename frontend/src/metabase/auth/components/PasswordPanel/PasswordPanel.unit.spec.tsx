import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PasswordPanel from "./PasswordPanel";
import { AuthProvider } from "metabase/auth/types";

describe("PasswordPanel", () => {
  it("should login successfully", () => {
    const onLogin = jest.fn().mockResolvedValue({});

    render(<PasswordPanel onLogin={onLogin} />);
    userEvent.click(screen.getByText("Sign in"));

    expect(onLogin).toHaveBeenCalled();
  });

  it("should render a link to reset the password and a list of auth providers", () => {
    const providers = [getAuthProvider()];
    const onLogin = jest.fn();

    render(<PasswordPanel providers={providers} onLogin={onLogin} />);

    expect(screen.getByText(/forgotten my password/)).toBeInTheDocument();
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
  });
});

interface FormMockProps {
  submitTitle: string;
  onSubmit: () => void;
}

const FormMock = ({ submitTitle, onSubmit }: FormMockProps) => {
  return <button onClick={onSubmit}>{submitTitle}</button>;
};

jest.mock("metabase/entities/users", () => ({
  forms: { login: jest.fn() },
  Form: FormMock,
}));

const getAuthProvider = (opts?: Partial<AuthProvider>): AuthProvider => ({
  name: "google",
  Button: AuthButtonMock,
  ...opts,
});

const AuthButtonMock = () => <a href="/">Sign in with Google</a>;
