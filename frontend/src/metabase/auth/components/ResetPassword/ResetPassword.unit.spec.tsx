import React, { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetPassword, { ResetPasswordProps } from "./ResetPassword";

describe("ResetPassword", () => {
  it("should show a form when token validations succeeds", async () => {
    const props = getProps({
      onValidatePasswordToken: jest.fn().mockResolvedValue({}),
    });

    render(<ResetPassword {...props} />);

    const message = await screen.findByText("New password");
    expect(message).toBeInTheDocument();
  });

  it("should show an error message when token validation fails", async () => {
    const props = getProps({
      onValidatePasswordToken: jest.fn().mockRejectedValue({}),
    });

    render(<ResetPassword {...props} />);

    const message = await screen.findByText("Whoops, that's an expired link");
    expect(message).toBeInTheDocument();
  });

  it("should show a success message when the form is submitted", async () => {
    const onShowToast = jest.fn();
    const onRedirect = jest.fn();

    const props = getProps({
      onResetPassword: jest.fn().mockResolvedValue({}),
      onValidatePasswordToken: jest.fn().mockResolvedValue({}),
      onShowToast,
      onRedirect,
    });

    render(
      <ResetPassword
        {...props}
        onShowToast={onShowToast}
        onRedirect={onRedirect}
      />,
    );

    const button = await screen.findByText("Save new password");

    userEvent.click(button);

    await waitFor(() => {
      expect(onRedirect).toHaveBeenCalledWith("/");
      expect(onShowToast).toHaveBeenCalledWith({
        message: "You've updated your password.",
      });
    });
  });
});

const getProps = (opts?: Partial<ResetPasswordProps>): ResetPasswordProps => {
  return {
    token: "token",
    onResetPassword: jest.fn(),
    onValidatePassword: jest.fn(),
    onValidatePasswordToken: jest.fn(),
    onShowToast: jest.fn(),
    onRedirect: jest.fn(),
    ...opts,
  };
};

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
