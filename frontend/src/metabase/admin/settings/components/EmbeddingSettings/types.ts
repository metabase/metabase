import type { SettingKey, Settings } from "metabase-types/api";

type Setting<K extends SettingKey> = { key: K };

export interface AdminSettingComponentProps {
  updateSetting: <K extends SettingKey>(
    setting: Setting<K>,
    value: Settings[K] | null,
  ) => Promise<void>;
}
