import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { SetupState, SetupStep } from "metabase/redux/store";
import {
  createMockSetupState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { CompletedStep } from "./CompletedStep";

interface SetupOpts {
  step?: SetupStep;
  setupState?: Partial<SetupState>;
  settings?: Partial<EnterpriseSettings>;
}

const setup = ({
  step = "completed",
  setupState = {},
  settings = {},
}: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState({
      step,
      ...setupState,
    }),
    settings: mockSettings(createMockSettings(settings)),
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

    expect(
      screen.getByText(
        "Get infrequent emails about new releases and feature updates.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Take me to Metabase")).toBeInTheDocument();
  });

  it("should offer to set up AI", () => {
    setup();

    expect(screen.getByText("Want to use AI in Metabase?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up AI" })).toBeEnabled();
  });

  it("should not offer to set up AI once it has been requested", () => {
    setup({ setupState: { isAiConfigRequested: true } });

    expect(
      screen.queryByRole("button", { name: "Set up AI" }),
    ).not.toBeInTheDocument();
  });

  it("should not offer to set up AI when AI features are disabled", () => {
    setup({ settings: { "ai-features-enabled?": false } });

    expect(
      screen.queryByRole("button", { name: "Set up AI" }),
    ).not.toBeInTheDocument();
  });
});
