import type { SettingKey, Settings } from "metabase-types/api";

export interface AdminSettingComponentProps {
  updateSetting: <K extends SettingKey>(
    settingKey: K,
    value: Settings[K],
  ) => Promise<void>;
}
