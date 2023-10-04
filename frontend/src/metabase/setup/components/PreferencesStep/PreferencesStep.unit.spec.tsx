import userEvent from "@testing-library/user-event";
import {
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";
import { setupErrorSetupEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { PREFERENCES_STEP, USER_STEP } from "../../constants";
import { PreferencesStep } from "./PreferencesStep";

interface SetupOpts {
  step?: number;
}

const setup = ({ step = PREFERENCES_STEP }: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState({
      step,
    }),
  });

  setupErrorSetupEndpoints();
  renderWithProviders(<PreferencesStep />, { storeInitialState: state });
};

describe("PreferencesStep", () => {
  it("should render in inactive state", () => {
    setup({ step: USER_STEP });

    expect(screen.getByText("Usage data preferences")).toBeInTheDocument();
  });

  it("should allow toggling tracking permissions", () => {
    setup({ step: PREFERENCES_STEP });

    const toggle = screen.getByRole("switch", { name: /Allow Metabase/ });
    userEvent.click(toggle);

    expect(toggle).toBeChecked();
  });

  it("should show an error message on submit", async () => {
    setup({ step: PREFERENCES_STEP });

    userEvent.click(screen.getByText("Finish"));

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
  });
});
