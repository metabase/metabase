import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import type { SettingKey, Settings } from "metabase-types/api";

type DisplaySetting<Key extends SettingKey> = {
  key: Key;
  [key: string]: any;
};
type SettingWithValue<Key extends SettingKey> = {
  key: Key;
  value: Settings[Key];
  [key: string]: any;
};

export function useMergeSetting<Key extends SettingKey>(
  displaySetting: DisplaySetting<Key>,
): SettingWithValue<Key> {
  const apiSetting = useSelector(state => state.admin.settings.settings).find(
    (setting: any) => setting.key === displaySetting.key,
  ) as unknown as SettingWithValue<Key>;
  const mergedSetting = useMemo(() => {
    return {
      ...apiSetting,
      ...displaySetting,
    };
  }, [apiSetting, displaySetting]);

  return mergedSetting;
}
