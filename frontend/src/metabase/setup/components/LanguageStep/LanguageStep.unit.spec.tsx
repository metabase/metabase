import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LanguageStep, { Props } from "./LanguageStep";
import { Locale } from "../../types";

describe("LanguageStep", () => {
  it("should render in inactive state", () => {
    const props = getProps({
      locale: getLocale({ name: "English" }),
      isStepActive: false,
    });

    render(<LanguageStep {...props} />);

    expect(screen.getByText(/set to English/)).toBeInTheDocument();
  });

  it("should allow language selection", () => {
    const props = getProps({
      isStepActive: true,
      onLocaleChange: jest.fn(),
    });

    render(<LanguageStep {...props} />);
    userEvent.click(screen.getByText("English"));

    expect(props.onLocaleChange).toHaveBeenCalled();
  });
});

const getProps = (opts?: Partial<Props>): Props => ({
  isStepActive: false,
  isSetupCompleted: false,
  isStepCompleted: false,
  onLocaleChange: jest.fn(),
  onStepSelect: jest.fn(),
  onStepSubmit: jest.fn(),
  ...opts,
});

const getLocale = (opts?: Partial<Locale>): Locale => ({
  code: "en",
  name: "English",
  ...opts,
});
