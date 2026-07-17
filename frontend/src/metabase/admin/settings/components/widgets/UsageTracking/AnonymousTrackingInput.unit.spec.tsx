import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import * as analytics from "../../../analytics";

import { AnonymousTrackingInput } from "./AnonymousTrackingInput";

const trackingFN = jest.spyOn(analytics, "trackTrackingPermissionChanged");

const SETTING_NAME = "anon-tracking-enabled";
const SETTING_ENV_VAR_NAME = "MB_ANON_TRACKING_ENABLED";

const setup = ({
  value,
  isEnvSetting,
}: {
  value: boolean;
  isEnvSetting?: boolean;
}) => {
  const settings = createMockSettings({
    [SETTING_NAME]: value,
  });

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: SETTING_NAME,
      description: "Enable the collection of anonymous usage data",
      value: false,
      is_env_setting: isEnvSetting,
      env_name: isEnvSetting ? SETTING_ENV_VAR_NAME : undefined,
    }),
  ]);

  return renderWithProviders(
    <div>
      <AnonymousTrackingInput />
      <UndoListing />
    </div>,
  );
};

describe("AnonymousTrackingInput", () => {
  it("should show an anonymous tracking toggle", async () => {
    setup({ value: true });
    expect(
      await screen.findByText("Send anonymous tracking data to Metabase"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Enable the collection of anonymous usage data/),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("should toggle the anonymous tracking setting off", async () => {
    setup({ value: true });
    const toggle = await screen.findByRole("switch");
    // The switch renders before the settings load; wait for the loaded state.
    await waitFor(() => expect(toggle).toBeChecked());
    // After the save, the component refetches properties; return the new value.
    setupPropertiesEndpoints(createMockSettings({ [SETTING_NAME]: false }));
    await userEvent.click(toggle);
    await waitFor(() => expect(trackingFN).toHaveBeenCalledWith(false));

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(new RegExp(`/api/setting/${SETTING_NAME}`));
    expect(body).toEqual({ value: false });

    await waitFor(() => expect(screen.getByRole("switch")).not.toBeChecked());
  });

  it("should toggle the anonymous tracking setting on", async () => {
    setup({ value: false });
    // The loaded state is also unchecked, so wait for the settings-endpoint
    // description text as the "data has arrived" signal before interacting.
    await screen.findByText(/Enable the collection of anonymous usage data/);
    const toggle = await screen.findByRole("switch");
    setupPropertiesEndpoints(createMockSettings({ [SETTING_NAME]: true }));
    await userEvent.click(toggle);

    await waitFor(async () => {
      const [{ url, body }] = await findRequests("PUT");
      expect(url).toMatch(new RegExp(`/api/setting/${SETTING_NAME}`));
      expect(body).toEqual({ value: true });
    });
    expect(trackingFN).toHaveBeenCalledWith(true);

    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
  });

  it("should show environment variable message when anonymous tracking is set via env var", async () => {
    setup({ value: true, isEnvSetting: true });
    expect(
      await screen.findByText(/This has been set by the/),
    ).toBeInTheDocument();
    expect(await screen.findByText(SETTING_ENV_VAR_NAME)).toBeInTheDocument();
  });

  it("should not show the switch when anonymous tracking is set via env var", async () => {
    setup({ value: true, isEnvSetting: true });
    await screen.findByText(/This has been set by the/);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("should show the switch when anonymous tracking is not set via env var", async () => {
    setup({ value: true, isEnvSetting: false });

    expect(await screen.findByRole("switch")).toBeInTheDocument();
  });
});
