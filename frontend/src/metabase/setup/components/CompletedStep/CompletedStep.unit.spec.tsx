import { renderWithProviders, screen } from "__support__/ui";
import type { SetupStep } from "metabase/setup/types";
import {
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";

import { CompletedStep } from "./CompletedStep";

interface SetupOpts {
  step?: SetupStep;
}

const setup = ({ step = "completed" }: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState({
      step,
    }),
  });

  renderWithProviders(<CompletedStep />, { storeInitialState: state });
};

describe("CompletedStep", () => {
  it("should render in inactive state", () => {
    setup({ step: "user_info" });

    expect(screen.queryByText("You're all set up!")).not.toBeInTheDocument();
  });

  it("should show a newsletter form and a link to the app", () => {
    setup({ step: "completed" });

    expect(screen.getByText("Metabase Newsletter")).toBeInTheDocument();
    expect(screen.getByText("Take me to Metabase")).toBeInTheDocument();
  });
});
