import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { SettingDefinition } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { EmbeddingToggle, type EmbeddingToggleProps } from "./EmbeddingToggle";

type SetupProps = Partial<
  Pick<EmbeddingToggleProps, "settingKey" | "label" | "disabled">
> &
  Omit<SettingDefinition<EmbeddingToggleProps["settingKey"]>, "key">;

const setup = async ({
  settingKey = "enable-embedding-static",
  label = undefined,
  disabled = undefined,
  is_env_setting = false,
  value = false,
}: SetupProps = {}) => {
  const settings = [
    createMockSettingDefinition({
      key: settingKey,
      is_env_setting,
      value,
    }),
  ];
  const settingValues = createMockSettings({
    [settingKey]: value,
  });

  setupSettingsEndpoints(settings);
  setupPropertiesEndpoints(settingValues);
  setupUpdateSettingsEndpoint();

  renderWithProviders(
    <EmbeddingToggle
      settingKey={settingKey}
      disabled={disabled}
      {...(label ? { label } : {})}
    />,
  );
  await waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets).toHaveLength(2);
  });
};

describe("EmbeddingToggle", () => {
  it("should render 'Set via environment variable' text when is_env_setting is true", async () => {
    await setup({ is_env_setting: true });
    expect(
      screen.getByText("Set via environment variable"),
    ).toBeInTheDocument();
  });

  describe("when is_env_setting is false", () => {
    it("should render a switch in the 'on' position when value is true", async () => {
      await setup({ value: true });
      const switchElement = screen.getByRole("switch");
      expect(switchElement).toBeInTheDocument();
      expect(switchElement).toBeChecked();
      expect(screen.getByText("Enabled")).toBeInTheDocument();
    });

    it("should render a switch in the 'off' position when value is false", () => {
      setup({ value: false });
      const switchElement = screen.getByRole("switch");
      expect(switchElement).toBeInTheDocument();
      expect(switchElement).not.toBeChecked();
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });
  });

  describe("when clicking on the switch", () => {
    it("should send a PUT request with value=true when setting is off", async () => {
      await setup({ value: false });

      expect(screen.getByRole("switch")).not.toBeChecked();
      await userEvent.click(screen.getByRole("switch"));

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      const [{ body }] = puts;
      expect(body).toEqual({ "enable-embedding-static": true });
    });

    it("should send a PUT request with value=false when setting is on", async () => {
      await setup({ value: true });

      expect(screen.getByRole("switch")).toBeChecked();
      await userEvent.click(screen.getByRole("switch"));

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      const [{ body }] = puts;
      expect(body).toEqual({ "enable-embedding-static": false });
    });
  });

  it("should pass additional props to Switch component", async () => {
    await setup({ disabled: true });
    const switchElement = screen.getByRole("switch");
    expect(switchElement).toBeDisabled();
  });
});
