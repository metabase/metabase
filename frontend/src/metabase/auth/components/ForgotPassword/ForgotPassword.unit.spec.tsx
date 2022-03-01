import React, { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ForgotPassword, { ForgotPasswordProps } from "./ForgotPassword";

describe("ForgotPassword", () => {
  it("should show a form when the user can reset their password", () => {
    const props = getProps({ canResetPassword: true });

    render(<ForgotPassword {...props} />);

    expect(screen.getByText("Forgot password")).toBeInTheDocument();
  });

  it("should show a success message when the form is submitted", async () => {
    const props = getProps({
      canResetPassword: true,
      onResetPassword: jest.fn().mockResolvedValue({}),
    });

    render(<ForgotPassword {...props} />);
    userEvent.click(screen.getByText("Send password reset email"));

    const message = await screen.findByText(/Check your email/);
    expect(message).toBeInTheDocument();
  });

  it("should show an error message when the user cannot reset their password", () => {
    const props = getProps({ canResetPassword: false });

    render(<ForgotPassword {...props} />);

    expect(screen.getByText(/contact an administrator/)).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<ForgotPasswordProps>,
): ForgotPasswordProps => ({
  canResetPassword: false,
  onResetPassword: jest.fn(),
  ...opts,
});

interface FormMockProps {
  submitTitle: string;
  onSubmit: () => void;
}

const FormMock = ({ submitTitle, onSubmit }: FormMockProps) => {
  return <button onClick={onSubmit}>{submitTitle}</button>;
};

jest.mock("metabase/entities/users", () => ({
  forms: { password_reset: jest.fn() },
  Form: FormMock,
}));

interface AuthLayoutMockProps {
  children?: ReactNode;
}

const AuthLayoutMock = ({ children }: AuthLayoutMockProps) => {
  return <div>{children}</div>;
};

jest.mock("../../containers/AuthLayout", () => AuthLayoutMock);
