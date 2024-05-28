import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { WelcomePage } from "./WelcomePage";

const setup = () => {
  const state = createMockState({
    settings: createMockSettingsState({
      "available-locales": [["en", "English"]],
    }),
  });

  renderWithProviders(<WelcomePage />, { storeInitialState: state });
};

describe("WelcomePage", () => {
  it("should render before the timeout when the locale is loaded", async () => {
    setup();

    expect(screen.queryByText("Welcome to Metabase")).not.toBeInTheDocument();
    expect(await screen.findByText("Welcome to Metabase")).toBeInTheDocument();
  });
});
