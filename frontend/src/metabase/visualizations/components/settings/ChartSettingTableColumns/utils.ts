import * as Lib from "metabase-lib";
import type { TableColumnOrderSetting } from "metabase-types/api";
import type { ColumnItem, ColumnSetting } from "./types";

export function getSettings(
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

export function getSettingIndexes(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
  settings: ColumnSetting[],
) {
  const columnIndexes = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    settings.map(setting => setting.fieldRef),
  );

  return columnIndexes.reduce(
    (settingIndexes: number[], columnIndex, settingIndex) => {
      settingIndexes[columnIndex] = settingIndex;
      return settingIndexes;
    },
    [],
  );
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
