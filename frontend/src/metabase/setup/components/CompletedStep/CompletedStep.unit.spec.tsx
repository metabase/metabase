import React from "react";
import { render, screen } from "@testing-library/react";
import CompletedStep, { CompletedStepProps } from "./CompletedStep";

const NewsletterFormMock = () => <div>Metabase Newsletter</div>;
jest.mock("../../containers/NewsletterForm", () => NewsletterFormMock);

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

    expect(screen.getByText("Metabase Newsletter")).toBeInTheDocument();
    expect(screen.getByText("Take me to Metabase")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<CompletedStepProps>): CompletedStepProps => ({
  isStepActive: false,
  ...opts,
});
