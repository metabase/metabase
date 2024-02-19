import type { TableColumnOrderSetting } from "metabase-types/api";
import type { ColumnItem, ColumnSetting } from "./types";

export function getColumnSettings(
  settings: TableColumnOrderSetting[],
): ColumnSetting[] {
  return settings.reduce((settings: ColumnSetting[], setting) => {
    if (setting.fieldRef) {
      settings.push({
        name: setting.name,
        enabled: setting.enabled,
        fieldRef: setting.fieldRef,
      });
    }
    return settings;
  }, []);
}

export function toggleColumnInSettings(
  { name, fieldRef, settingIndex }: ColumnItem,
  settings: ColumnSetting[],
  isEnabled: boolean,
): ColumnSetting[] {
  const newSettings = [...settings];

  if (settingIndex >= 0) {
    const setting = newSettings[settingIndex];
    newSettings[settingIndex] = { ...setting, enabled: isEnabled };
  } else {
    newSettings.push({ name, fieldRef, enabled: isEnabled });
  }

  return newSettings;
}
