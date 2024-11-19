import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { SettingDefinition } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import {
  createMockAdminState,
  createMockState,
} from "metabase-types/store/mocks";

import {
  SwitchWithSetByEnvVar,
  type SwitchWithSetByEnvVarProps,
} from "./SwitchWithSetByEnvVar";

type SetupProps = Partial<
  Pick<SwitchWithSetByEnvVarProps, "settingKey" | "label" | "disabled">
> &
  Omit<SettingDefinition<SwitchWithSetByEnvVarProps["settingKey"]>, "key">;

const setup = ({
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

  const state = createMockState({
    settings: mockSettings(settingValues),
    admin: createMockAdminState({
      settings: {
        settings,
        warnings: {},
      },
    }),
  });

  setupSettingsEndpoints(settings);
  setupPropertiesEndpoints(settingValues);

  const onChange = jest.fn();

  renderWithProviders(
    <SwitchWithSetByEnvVar
      onChange={onChange}
      settingKey={settingKey}
      disabled={disabled}
      {...(label ? { label } : {})}
    />,
    {
      storeInitialState: state,
    },
  );

  return { onChange };
};

describe("SwitchWithSetByEnvVar", () => {
  it("should render 'Set via environment variable' text when is_env_setting is true", () => {
    setup({
      is_env_setting: true,
    });
    expect(
      screen.getByText("Set via environment variable"),
    ).toBeInTheDocument();
  });

  describe("when is_env_setting is false", () => {
    it("should render a switch in the 'on' position when value is true", () => {
      setup({
        value: true,
      });
      const switchElement = screen.getByRole("checkbox");
      expect(switchElement).toBeInTheDocument();
      expect(switchElement).toBeChecked();
      expect(screen.getByText("Enabled")).toBeInTheDocument();
    });

    it("should render a switch in the 'off' position when value is false", () => {
      setup({
        value: false,
      });
      const switchElement = screen.getByRole("checkbox");
      expect(switchElement).toBeInTheDocument();
      expect(switchElement).not.toBeChecked();
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });
  });

  describe("when clicking on the switch", () => {
    beforeEach(() => {
      fetchMock.put("path:/api/setting/enable-embedding-static", 204);
    });

    it("should send a PUT request with value=true when setting is off", async () => {
      const { onChange } = setup({
        value: false,
      });

      expect(screen.getByRole("checkbox")).not.toBeChecked();
      await userEvent.click(screen.getByRole("checkbox"));

      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("should send a PUT request with value=false when setting is on", async () => {
      const { onChange } = setup({
        value: true,
      });

      expect(screen.getByRole("checkbox")).toBeChecked();
      await userEvent.click(screen.getByRole("checkbox"));

      expect(onChange).toHaveBeenCalledWith(false);
    });
  });

  it("should pass additional props to Switch component", () => {
    setup({ disabled: true });
    const switchElement = screen.getByRole("checkbox");
    expect(switchElement).toBeDisabled();
  });
});
