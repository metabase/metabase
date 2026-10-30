import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  setupAIControlsInstanceLimitEndpoint,
  setupUpdateAIControlsInstanceLimitEndpoint,
} from "__support__/server-mocks/metabot";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  EnterpriseSettingKey,
  MetabotLimitPeriod,
  MetabotLimitType,
} from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { GeneralLimitsSettingsSection } from "./GeneralLimitsSettingsSection";

type SetupOpts = {
  limitType?: MetabotLimitType;
  limitPeriod?: MetabotLimitPeriod;
  quotaMessage?: string;
  instanceMaxUsage?: number | null;
};

async function setup({
  limitType = "tokens",
  limitPeriod = "monthly",
  quotaMessage = "",
  // Unjustified type cast. FIXME
  instanceMaxUsage = null as number | null,
}: SetupOpts = {}) {
  const settingValues = {
    "metabot-limit-unit": limitType,
    "metabot-limit-reset-rate": limitPeriod,
    "metabot-quota-reached-message": quotaMessage || null,
  };
  setupPropertiesEndpoints(createMockSettings(settingValues));
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupAIControlsInstanceLimitEndpoint({ max_usage: instanceMaxUsage });
  setupUpdateAIControlsInstanceLimitEndpoint();

  renderWithProviders(<GeneralLimitsSettingsSection />, {
    storeInitialState: { settings: createMockSettingsState(settingValues) },
  });

  await screen.findByText("How do you want to limit AI usage?");
}

async function getPutBodies(urlSuffix: string): Promise<unknown[]> {
  const requests = await findRequests("PUT");
  return requests
    .filter(({ url }) => url.endsWith(urlSuffix))
    .map(({ body }): unknown => body);
}

function getSettingUpdateBodies(settingKey: EnterpriseSettingKey) {
  return getPutBodies(`/api/setting/${settingKey}`);
}

function getInstanceLimitUpdateBodies() {
  return getPutBodies("/api/ee/ai-controls/usage/instance");
}

describe("GeneralLimitsSettingsSection", () => {
  it("renders the limit type segmented control with saved value", async () => {
    await setup({ limitType: "messages" });

    expect(
      screen.getByText("How do you want to limit AI usage?"),
    ).toBeInTheDocument();
    expect(screen.getByText("By token usage")).toBeInTheDocument();
    expect(screen.getByText("By message count")).toBeInTheDocument();

    // The radio input for the saved value should be checked
    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "By message count" }),
      ).toBeChecked();
    });

    expect(
      screen.getByRole("radio", { name: "By token usage" }),
    ).not.toBeChecked();
  });

  it("renders the reset period segmented control with saved value", async () => {
    await setup({ limitPeriod: "weekly" });

    expect(
      screen.getByText("When should usage limits reset?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Daily")).toBeInTheDocument();
    expect(screen.getByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();

    // The radio input for the saved value should be checked
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Weekly" })).toBeChecked();
    });

    expect(screen.getByRole("radio", { name: "Daily" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Monthly" })).not.toBeChecked();
  });

  it("shows token-based label for instance limit when limit type is tokens", async () => {
    await setup({ limitType: "tokens" });
    await waitFor(() => {
      expect(
        screen.getByText("Total monthly instance token limit"),
      ).toBeInTheDocument();
    });
  });

  it("shows message-based label for instance limit when limit type is messages", async () => {
    await setup({ limitType: "messages" });
    await waitFor(() => {
      expect(
        screen.getByText("Total monthly instance message limit"),
      ).toBeInTheDocument();
    });
  });

  it("populates the instance limit input from API data", async () => {
    await setup({ instanceMaxUsage: 500 });
    await waitFor(() => {
      expect(screen.getByDisplayValue("500")).toBeInTheDocument();
    });
  });

  it("shows 'Unlimited' placeholder when instance limit is null", async () => {
    await setup({ instanceMaxUsage: null });
    expect(screen.getByPlaceholderText("Unlimited")).toBeInTheDocument();
  });

  it("shows 'million' unit beside the instance limit input when limit type is tokens", async () => {
    await setup({ limitType: "tokens" });
    await waitFor(() => {
      expect(screen.getByText("million")).toBeInTheDocument();
    });
  });

  it("shows 'messages' unit beside the instance limit input when limit type is messages", async () => {
    await setup({ limitType: "messages" });
    await waitFor(() => {
      expect(screen.getByText("messages")).toBeInTheDocument();
    });
  });

  it("renders the quota-reached message input with saved value", async () => {
    await setup({ quotaMessage: "You hit the limit!" });
    await waitFor(() => {
      expect(
        screen.getByDisplayValue("You hit the limit!"),
      ).toBeInTheDocument();
    });
  });

  it("updates limit type setting when user clicks a different option", async () => {
    await setup({ limitType: "tokens" });
    await userEvent.click(screen.getByText("By message count"));

    expect(
      screen.getByText("Total monthly instance message limit"),
    ).toBeInTheDocument();
  });

  it("saves the limit type when the user picks another option", async () => {
    await setup({ limitType: "tokens" });
    await userEvent.click(screen.getByText("By message count"));

    await waitFor(async () =>
      expect(await getSettingUpdateBodies("metabot-limit-unit")).toEqual([
        { value: "messages" },
      ]),
    );
  });

  it("saves the reset period and relabels the instance limit when the user picks another period", async () => {
    await setup({ limitType: "messages", limitPeriod: "monthly" });
    await userEvent.click(screen.getByText("Weekly"));

    expect(
      await screen.findByLabelText("Total weekly instance message limit"),
    ).toBeInTheDocument();
    await waitFor(async () =>
      expect(await getSettingUpdateBodies("metabot-limit-reset-rate")).toEqual([
        { value: "weekly" },
      ]),
    );
  });

  it("saves the instance limit the user types", async () => {
    await setup({ limitType: "messages" });
    const input = await screen.findByLabelText(
      "Total monthly instance message limit",
    );

    await userEvent.type(input, "500");

    await waitFor(async () =>
      expect(await getInstanceLimitUpdateBodies()).toEqual([
        { max_usage: 500 },
      ]),
    );
  });

  it("removes the instance limit when the user clears it", async () => {
    await setup({ limitType: "messages", instanceMaxUsage: 100 });
    const input = await screen.findByDisplayValue("100");

    await userEvent.clear(input);

    await waitFor(async () =>
      expect(await getInstanceLimitUpdateBodies()).toEqual([
        { max_usage: null },
      ]),
    );
  });

  it("saves the quota-reached message the user types", async () => {
    await setup();

    await userEvent.type(
      screen.getByLabelText("Quota-reached message"),
      "You have hit the AI usage limit.",
    );

    await waitFor(async () =>
      expect(
        await getSettingUpdateBodies("metabot-quota-reached-message"),
      ).toEqual([{ value: "You have hit the AI usage limit." }]),
    );
  });

  it("updates reset period setting when user clicks a different option", async () => {
    await setup({ limitPeriod: "monthly" });
    expect(screen.getByRole("radio", { name: "Monthly" })).toBeChecked();

    await userEvent.click(screen.getByText("Daily"));

    await waitFor(() => {
      expect(screen.getByText(/total daily instance/i)).toBeInTheDocument();
    });
  });
});
