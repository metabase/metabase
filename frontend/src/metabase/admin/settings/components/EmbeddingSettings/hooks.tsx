import { useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import type {
  SettingDefinition,
  SettingKey,
  Settings,
} from "metabase-types/api";

import { updateSetting } from "../../settings";

type DisplaySetting<Key extends SettingKey> = {
  key: Key;
  [key: string]: any;
};
export type SettingWithValue<Key extends SettingKey> = {
  key: Key;
  value: Settings[Key];
  [key: string]: any;
};

export function useMergeSetting<Key extends SettingKey>(
  displaySetting: DisplaySetting<Key>,
): SettingDefinition<Key> {
  const apiSetting = useSelector(state => state.admin.settings.settings).find(
    setting => setting.key === displaySetting.key,
  ) as SettingDefinition<Key>;
  const mergedSetting = useMemo(() => {
    return {
      ...apiSetting,
      ...displaySetting,
    };
  }, [apiSetting, displaySetting]);

  return mergedSetting;
}

export const useEmbeddingSetting = <Key extends SettingKey>(
  displaySetting: DisplaySetting<Key>,
): [
  SettingDefinition<Key>,
  (value: SettingWithValue<Key>["value"]) => void,
] => {
  const mergedSetting = useMergeSetting(displaySetting);

  const dispatch = useDispatch();

  const handleSettingChange = (value: SettingWithValue<Key>["value"]) => {
    dispatch(updateSetting({ key: displaySetting.key, value }));
  };

  // used to match useState's get/set pattern with array values
  return [mergedSetting, handleSettingChange];
};
