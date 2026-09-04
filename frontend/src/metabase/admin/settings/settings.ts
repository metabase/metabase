import type {
  EnterpriseSettingKey,
  SettingDefinition,
} from "metabase-types/api";

export const isSettingSetFromEnvVar = <
  SettingName extends EnterpriseSettingKey,
>(
  settingDetails: SettingDefinition<SettingName> | undefined,
): settingDetails is SettingDefinition<SettingName> &
  Required<
    Pick<SettingDefinition<SettingName>, "is_env_setting" | "env_name">
  > => !!settingDetails?.is_env_setting && !!settingDetails?.env_name;

export const isSettingSysadminOnly = <SettingName extends EnterpriseSettingKey>(
  settingDetails: SettingDefinition<SettingName> | undefined,
): boolean => !!settingDetails?.sysadmin_only;
