import React from "react";
import { render, screen } from "@testing-library/react";
import UserStep, { Props } from "./UserStep";
import { UserInfo } from "../../types";

const UserFormMock = () => <div />;

jest.mock("metabase/entities/users", () => ({
  forms: { setup: jest.fn() },
  Form: UserFormMock,
}));

describe("UserStep", () => {
  it("should render in active state", () => {
    const props = getProps({
      isStepActive: true,
      isStepCompleted: false,
    });

    render(<UserStep {...props} />);

    expect(screen.getByText("What should we call you?")).toBeInTheDocument();
  });

  it("should render in completed state", () => {
    const props = getProps({
      user: getUserInfo({ first_name: "Testy" }),
      isStepActive: false,
      isStepCompleted: true,
    });

    render(<UserStep {...props} />);

    expect(screen.getByText(/Hi, Testy/)).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<Props>): Props => ({
  isStepActive: false,
  isStepCompleted: false,
  isSetupCompleted: false,
  isHosted: false,
  onPasswordChange: jest.fn(),
  onStepSelect: jest.fn(),
  onStepSubmit: jest.fn(),
  ...opts,
});

const getUserInfo = (opts?: Partial<UserInfo>): UserInfo => ({
  first_name: "Testy",
  last_name: "McTestface",
  email: "testy@metabase.test",
  site_name: "Epic Team",
  password: "metasample123",
  password_confirm: "metasample123",
  ...opts,
});
