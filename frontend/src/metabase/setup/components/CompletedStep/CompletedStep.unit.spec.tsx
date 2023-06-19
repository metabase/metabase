import {
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { COMPLETED_STEP, USER_STEP } from "../../constants";
import { CompletedStep } from "./CompletedStep";

interface SetupOpts {
  step?: number;
}

const setup = ({ step = COMPLETED_STEP }: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState({
      step,
    }),
  });

  renderWithProviders(<CompletedStep />, { storeInitialState: state });
};

describe("CompletedStep", () => {
  it("should render in inactive state", () => {
    setup({ step: USER_STEP });

    expect(screen.queryByText("You're all set up!")).not.toBeInTheDocument();
  });

  it("should show a newsletter form and a link to the app", () => {
    setup({ step: COMPLETED_STEP });

    expect(screen.getByText("Metabase Newsletter")).toBeInTheDocument();
    expect(screen.getByText("Take me to Metabase")).toBeInTheDocument();
  });
});
