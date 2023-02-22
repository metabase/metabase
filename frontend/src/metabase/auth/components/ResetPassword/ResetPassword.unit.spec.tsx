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

    await waitFor(() => {
      expect(props.onValidatePasswordToken).toHaveBeenCalledWith(props.token);
    });
    expect(screen.getByText("New password")).toBeInTheDocument();
  });

  it("should show an error message when token validation fails", async () => {
    const props = getProps({
      onValidatePasswordToken: jest.fn().mockRejectedValue({}),
    });

    render(<ResetPassword {...props} />);

    await waitFor(() => {
      expect(props.onValidatePasswordToken).toHaveBeenCalledWith(props.token);
    });
    expect(screen.getByText(/that's an expired link/)).toBeInTheDocument();
  });

  it("should show a success message when the form is submitted", async () => {
    const props = getProps({
      onResetPassword: jest.fn().mockResolvedValue({}),
      onValidatePassword: jest.fn().mockResolvedValue(undefined),
      onValidatePasswordToken: jest.fn().mockResolvedValue({}),
    });

    render(<ResetPassword {...props} />);

    await waitFor(() => {
      expect(props.onValidatePasswordToken).toHaveBeenCalledWith(props.token);
    });
    expect(screen.getByText("New password")).toBeInTheDocument();

    userEvent.type(screen.getByLabelText("Create a password"), "test");
    userEvent.type(screen.getByLabelText("Confirm your password"), "test");

    await waitFor(() => {
      expect(props.onValidatePassword).toHaveBeenCalledWith("test");
    });
    expect(screen.getByText("Save new password")).toBeEnabled();

    userEvent.click(screen.getByText("Save new password"));

    await waitFor(() => {
      expect(props.onResetPassword).toHaveBeenCalledWith(props.token, "test");
    });
    expect(props.onRedirect).toHaveBeenCalledWith("/");
    expect(props.onShowToast).toHaveBeenCalledWith({
      message: "You've updated your password.",
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

interface AuthLayoutMockProps {
  children?: ReactNode;
}

const AuthLayoutMock = ({ children }: AuthLayoutMockProps) => {
  return <div>{children}</div>;
};

jest.mock("../../containers/AuthLayout", () => AuthLayoutMock);
