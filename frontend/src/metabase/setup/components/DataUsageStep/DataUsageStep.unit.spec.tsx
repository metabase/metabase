import userEvent from "@testing-library/user-event";

import { setupErrorSetupEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { SetupStep } from "metabase/setup/types";
import {
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";

import { DataUsageStep } from "./DataUsageStep";

interface SetupOpts {
  step?: SetupStep;
}

const setup = ({ step = "data_usage" }: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState({
      step,
    }),
  });

  setupErrorSetupEndpoints();
  renderWithProviders(<DataUsageStep stepLabel={0} />, {
    storeInitialState: state,
  });
};

describe("DataUsageStep", () => {
  it("should render in inactive state", () => {
    setup({ step: "user_info" });

    expect(screen.getByText("Usage data preferences")).toBeInTheDocument();
  });

  it("should allow toggling tracking permissions", async () => {
    setup({ step: "data_usage" });

    const toggle = screen.getByRole("switch", { name: /Allow Metabase/ });
    await userEvent.click(toggle);

    expect(toggle).toBeChecked();
  });

  it("should show an error message on submit", async () => {
    setup({ step: "data_usage" });

    await userEvent.click(screen.getByText("Finish"));

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
  });
});
