import { render, screen } from "@testing-library/react";
import { UserInfo } from "metabase-types/store";
import UserStep, { UserStepProps } from "./UserStep";

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

const getProps = (opts?: Partial<UserStepProps>): UserStepProps => ({
  isHosted: false,
  isStepActive: false,
  isStepCompleted: false,
  isSetupCompleted: false,
  onValidatePassword: jest.fn(),
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
