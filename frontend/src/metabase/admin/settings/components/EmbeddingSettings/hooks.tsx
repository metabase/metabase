import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import type { SettingKey, Settings } from "metabase-types/api";

import { getSettings } from "../../selectors";

type DisplaySetting<Key extends SettingKey> = { key: Key };
type MergedSetting<Key extends SettingKey> = {
  key: Key;
  value: Settings[Key];
  [key: string]: any;
};
export function useMergeSetting<Key extends SettingKey>(
  displaySetting: DisplaySetting<Key>,
): MergedSetting<Key> {
  const apiSetting = useSelector(getSettings).find(
    (setting: any) => setting.key === displaySetting.key,
  );
  const mergedSetting = useMemo(() => {
    return {
      ...apiSetting,
      ...displaySetting,
    };
  }, [apiSetting, displaySetting]);

  return mergedSetting;
}
