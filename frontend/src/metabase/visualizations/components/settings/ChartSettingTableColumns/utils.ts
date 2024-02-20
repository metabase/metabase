import * as Lib from "metabase-lib";
import type { TableColumnOrderSetting } from "metabase-types/api";
import type { ColumnSetting } from "./types";

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

export function canEditQuery(query: Lib.Query, isDashboard?: boolean) {
  const { isNative, isEditable } = Lib.queryDisplayInfo(query);
  return !isNative && isEditable && !isDashboard;
}
