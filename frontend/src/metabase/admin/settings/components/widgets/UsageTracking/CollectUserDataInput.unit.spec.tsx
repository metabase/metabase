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

import { CollectUserDataInput } from "./CollectUserDataInput";

const { trackSimpleEvent } = jest.requireMock("metabase/utils/analytics");

const SETTING_NAME = "analytics-pii-retention-enabled";
const SETTING_ENV_VAR_NAME = "MB_ANALYTICS_PII_RETENTION_ENABLED";

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
      description:
        "Enable logging of path, user agent, and IP address of who views your internal data and embeds.",
      value: false,
      is_env_setting: isEnvSetting,
      env_name: isEnvSetting ? SETTING_ENV_VAR_NAME : undefined,
    }),
  ]);

  return renderWithProviders(
    <div>
      <CollectUserDataInput />
      <UndoListing />
    </div>,
  );
};

describe("CollectUserDataInput", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("should show the `analytics-pii-retention-enabled` setting toggle", async () => {
    setup({ value: true });
    expect(await screen.findByText("Collect user data")).toBeInTheDocument();
    expect(
      await screen.findByText(
        /Enable logging of path, user agent, and IP address of who views your internal data and embeds/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("should toggle the `analytics-pii-retention-enabled` setting off", async () => {
    setup({ value: true });
    await userEvent.click(screen.getByRole("switch"));
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "analytics_pii_retention_changed",
      event_detail: "disabled",
      triggered_from: "admin",
    });

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(new RegExp(`/api/setting/${SETTING_NAME}`));
    expect(body).toEqual({ value: false });

    expect(await screen.findByRole("switch")).not.toBeChecked();
  });

  it("should toggle the `analytics-pii-retention-enabled` setting on", async () => {
    setup({ value: false });
    await userEvent.click(screen.getByRole("switch"));

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(new RegExp(`/api/setting/${SETTING_NAME}`));
    expect(body).toEqual({ value: true });
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "analytics_pii_retention_changed",
      event_detail: "enabled",
      triggered_from: "admin",
    });

    expect(await screen.findByRole("switch")).toBeChecked();
  });

  it("should show environment variable message when `analytics-pii-retention-enabled` is set via env var", async () => {
    setup({ value: true, isEnvSetting: true });
    expect(
      await screen.findByText(/This has been set by the/),
    ).toBeInTheDocument();
    expect(await screen.findByText(SETTING_ENV_VAR_NAME)).toBeInTheDocument();
  });

  it("should not show the switch when `analytics-pii-retention-enabled` is set via env var", async () => {
    setup({ value: true, isEnvSetting: true });
    await screen.findByText(/This has been set by the/);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("should show the switch when `analytics-pii-retention-enabled` is not set via env var", async () => {
    setup({ value: true, isEnvSetting: false });

    expect(await screen.findByRole("switch")).toBeInTheDocument();
  });
});
