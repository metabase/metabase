import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
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
    expect(await screen.findByText("Anonymous tracking")).toBeInTheDocument();
    expect(
      await screen.findByText(/Enable the collection of anonymous usage data/),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("should toggle the anonymous tracking setting off", async () => {
    setup({ value: true });
    await userEvent.click(screen.getByRole("switch"));
    expect(trackingFN).toHaveBeenCalledWith(false);

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(new RegExp(`/api/setting/${SETTING_NAME}`));
    expect(body).toEqual({ value: false });

    expect(await screen.findByRole("switch")).not.toBeChecked();
  });

  it("should toggle the anonymous tracking setting on", async () => {
    setup({ value: false });
    await userEvent.click(screen.getByRole("switch"));

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(new RegExp(`/api/setting/${SETTING_NAME}`));
    expect(body).toEqual({ value: true });
    expect(trackingFN).toHaveBeenCalledWith(true);

    expect(await screen.findByRole("switch")).toBeChecked();
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
