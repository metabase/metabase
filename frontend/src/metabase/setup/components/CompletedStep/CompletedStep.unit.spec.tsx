import React from "react";
import { render, screen } from "@testing-library/react";
import CompletedStep, { CompletedStepProps } from "./CompletedStep";
import { UserInfo } from "../../types";

describe("CompletedStep", () => {
  it("should render in inactive state", () => {
    const props = getProps({
      isStepActive: false,
    });

    render(<CompletedStep {...props} />);

    expect(screen.queryByText("You're all set up!")).not.toBeInTheDocument();
  });

  it("should show a newsletter form and a link to the app", () => {
    const props = getProps({
      isStepActive: true,
    });

    render(<CompletedStep {...props} />);

    expect(screen.getByText("Metabase Newsletter"));
    expect(screen.getByText("Take me to Metabase"));
  });
});

const getProps = (opts?: Partial<CompletedStepProps>): CompletedStepProps => ({
  user: getUserInfo(),
  isStepActive: false,
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
