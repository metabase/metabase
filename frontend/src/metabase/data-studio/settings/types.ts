import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
} from "metabase-types/api";

export type DataStudioSetting = {
  [K in EnterpriseSettingKey]: {
    key: K;
    value: EnterpriseSettings[K];
    name: string;
    description: string;
  };
}[EnterpriseSettingKey];
