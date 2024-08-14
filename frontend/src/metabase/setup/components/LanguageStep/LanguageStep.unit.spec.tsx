import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { SetupStep } from "metabase/setup/types";
import type { Locale } from "metabase-types/store";
import {
  createMockLocale,
  createMockSettingsState,
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";

import { LanguageStep } from "./LanguageStep";

interface SetupOpts {
  step?: SetupStep;
  locale?: Locale;
}

const setup = ({ step = "language", locale }: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState({
      step,
      locale,
    }),
    settings: createMockSettingsState({
      "available-locales": [["en", "English"]],
    }),
  });

  renderWithProviders(<LanguageStep stepLabel={0} />, {
    storeInitialState: state,
  });
};

describe("LanguageStep", () => {
  it("should render in inactive state", () => {
    setup({
      step: "user_info",
      locale: createMockLocale({ name: "English" }),
    });

    expect(screen.getByText(/set to English/)).toBeInTheDocument();
  });

  it("should allow language selection", async () => {
    setup({
      step: "language",
    });

    const option = screen.getByRole("radio", { name: "English" });
    await userEvent.click(option);

    expect(option).toBeChecked();
  });
});
