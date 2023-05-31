import userEvent from "@testing-library/user-event";
import { Locale } from "metabase-types/store";
import {
  createMockLocale,
  createMockSettingsState,
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { LANGUAGE_STEP, USER_STEP } from "../../constants";
import { LanguageStep } from "./LanguageStep";

interface SetupOpts {
  step?: number;
  locale?: Locale;
}

const setup = ({ step = LANGUAGE_STEP, locale }: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState({
      step,
      locale,
    }),
    settings: createMockSettingsState({
      "available-locales": [["en", "English"]],
    }),
  });

  renderWithProviders(<LanguageStep />, { storeInitialState: state });
};

describe("LanguageStep", () => {
  it("should render in inactive state", () => {
    setup({
      step: USER_STEP,
      locale: createMockLocale({ name: "English" }),
    });

    expect(screen.getByText(/set to English/)).toBeInTheDocument();
  });

  it("should allow language selection", () => {
    setup({
      step: LANGUAGE_STEP,
    });

    const option = screen.getByRole("radio", { name: "English" });
    userEvent.click(option);

    expect(option).toBeChecked();
  });
});
