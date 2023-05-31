import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Locale } from "metabase-types/store";
import LanguageStep, { LanguageStepProps } from "./LanguageStep";

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

const getProps = (opts?: Partial<LanguageStepProps>): LanguageStepProps => ({
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
