import type { SettingDefinition, SettingKey } from "metabase-types/api";

export const isSettingSetFromEnvVar = <SettingName extends SettingKey>(
  settingDetails: SettingDefinition<SettingName> | undefined,
): settingDetails is SettingDefinition<SettingName> &
  Required<
    Pick<SettingDefinition<SettingName>, "is_env_setting" | "env_name">
  > => !!settingDetails?.is_env_setting && !!settingDetails?.env_name;
