import userEvent from "@testing-library/user-event";

import {
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { SchedulingPausedCallout } from "./SchedulingPausedCallout";

type SetupOpts = {
  isSchedulingEnabled?: boolean;
  isAdmin?: boolean;
  isEnvSetting?: boolean;
};

const setup = ({
  isSchedulingEnabled = false,
  isAdmin = false,
  isEnvSetting = false,
}: SetupOpts = {}) => {
  const settings = createMockSettings({
    "transforms-scheduling-enabled": isSchedulingEnabled,
  });
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "transforms-scheduling-enabled",
      value: isSchedulingEnabled,
      is_env_setting: isEnvSetting,
      env_name: "MB_TRANSFORMS_SCHEDULING_ENABLED",
    }),
  ]);
  const settingsStore = setupStatefulSettingsEndpoints(settings);

  renderWithProviders(<SchedulingPausedCallout />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
      settings: createMockSettingsState(settings),
    }),
  });

  return { settingsStore };
};

describe("SchedulingPausedCallout", () => {
  it("renders nothing when scheduling is enabled", () => {
    setup({ isSchedulingEnabled: true, isAdmin: true });

    expect(
      screen.queryByTestId("transforms-scheduling-paused-callout"),
    ).not.toBeInTheDocument();
  });

  it("shows the callout without the override to a non-admin", () => {
    setup({ isAdmin: false });

    expect(
      screen.getByTestId("transforms-scheduling-paused-callout"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Turn scheduling back on" }),
    ).not.toBeInTheDocument();
  });

  it("lets an admin turn scheduling back on", async () => {
    const { settingsStore } = setup({ isAdmin: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Turn scheduling back on" }),
    );

    await waitFor(() =>
      expect(settingsStore["transforms-scheduling-enabled"]).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId("transforms-scheduling-paused-callout"),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows the environment variable instead of the override when the value comes from the environment", async () => {
    setup({ isAdmin: true, isEnvSetting: true });

    expect(
      await screen.findByTestId("setting-env-var-message"),
    ).toHaveTextContent("MB_TRANSFORMS_SCHEDULING_ENABLED");
    expect(
      screen.queryByRole("button", { name: "Turn scheduling back on" }),
    ).not.toBeInTheDocument();
  });
});
