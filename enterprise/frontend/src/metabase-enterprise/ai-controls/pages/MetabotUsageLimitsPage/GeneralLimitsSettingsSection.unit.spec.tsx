import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  setupAIControlsInstanceLimitEndpoint,
  setupUpdateAIControlsInstanceLimitEndpoint,
} from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { MetabotLimitPeriod, MetabotLimitType } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { GeneralLimitsSettingsSection } from "./GeneralLimitsSettingsSection";

function setup({
  limitType = "tokens" as MetabotLimitType,
  limitPeriod = "monthly" as MetabotLimitPeriod,
  quotaMessage = "",
  instanceMaxUsage = null as number | null,
} = {}) {
  setupPropertiesEndpoints(
    createMockSettings({
      "metabot-limit-unit": limitType,
      "metabot-limit-reset-rate": limitPeriod,
      "metabot-quota-reached-message": quotaMessage || null,
    }),
  );
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupAIControlsInstanceLimitEndpoint({ max_usage: instanceMaxUsage });
  setupUpdateAIControlsInstanceLimitEndpoint();

  renderWithProviders(<GeneralLimitsSettingsSection />);
}

describe("GeneralLimitsSettingsSection", () => {
  it("renders the limit type segmented control with saved value", async () => {
    setup({ limitType: "conversations" });

    expect(
      await screen.findByText("How do you want to limit AI usage?"),
    ).toBeInTheDocument();
    expect(screen.getByText("By token usage")).toBeInTheDocument();
    expect(screen.getByText("By conversation count")).toBeInTheDocument();
  });

  it("renders the reset period segmented control with saved value", async () => {
    setup({ limitPeriod: "weekly" });

    expect(
      await screen.findByText("When should usage limits reset?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Daily")).toBeInTheDocument();
    expect(screen.getByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
  });

  it("shows token-based label for instance limit when limit type is tokens", async () => {
    setup({ limitType: "tokens" });
    await screen.findByText("How do you want to limit AI usage?");

    await waitFor(() => {
      expect(
        screen.getByText(/Total monthly instance limit \(millions of tokens\)/),
      ).toBeInTheDocument();
    });
  });

  it("shows conversation-based label for instance limit when limit type is conversations", async () => {
    setup({ limitType: "conversations" });
    await screen.findByText("How do you want to limit AI usage?");

    await waitFor(() => {
      expect(
        screen.getByText(/instance limit \(conversations\)/),
      ).toBeInTheDocument();
    });
  });

  it("populates the instance limit input from API data", async () => {
    setup({ instanceMaxUsage: 500 });
    await screen.findByText("How do you want to limit AI usage?");

    await waitFor(() => {
      expect(screen.getByDisplayValue("500")).toBeInTheDocument();
    });
  });

  it("shows 'Unlimited' placeholder when instance limit is null", async () => {
    setup({ instanceMaxUsage: null });
    await screen.findByText("How do you want to limit AI usage?");

    expect(screen.getByPlaceholderText("Unlimited")).toBeInTheDocument();
  });

  it("renders the quota-reached message input with saved value", async () => {
    setup({ quotaMessage: "You hit the limit!" });
    await screen.findByText("How do you want to limit AI usage?");

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("You hit the limit!"),
      ).toBeInTheDocument();
    });
  });

  it("updates limit type setting when user clicks a different option", async () => {
    setup({ limitType: "tokens" });
    await screen.findByText("How do you want to limit AI usage?");

    await userEvent.click(screen.getByText("By conversation count"));

    expect(
      screen.getByText(/instance limit \(conversations\)/),
    ).toBeInTheDocument();
  });

  it("updates reset period setting when user clicks a different option", async () => {
    setup({ limitPeriod: "monthly" });
    await screen.findByText("When should usage limits reset?");

    await userEvent.click(screen.getByText("Daily"));

    await waitFor(() => {
      expect(screen.getByText(/daily.*instance limit/i)).toBeInTheDocument();
    });
  });
});
