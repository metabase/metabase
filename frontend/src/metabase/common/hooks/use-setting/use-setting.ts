import { useDispatch, useSelector } from "metabase/lib/redux";
import type { UpdateUserSettingOptions } from "metabase/redux/settings";
import { updateUserSetting } from "metabase/redux/settings";
import { getSetting } from "metabase/selectors/settings";
import type { Settings, UserSettings } from "metabase-types/api";

export const useSetting = <SettingName extends keyof Settings>(
  settingName: SettingName,
) => {
  return useSelector(state => getSetting(state, settingName));
};

export const useUserSetting = <T extends keyof UserSettings>(
  key: T,
  options?: UpdateUserSettingOptions,
): [UserSettings[T], (value: UserSettings[T]) => void] => {
  const currentValue = useSetting(key);
  const dispatch = useDispatch();
  const setter = (value: UserSettings[T]) => {
    dispatch(updateUserSetting({ key, value }, options));
  };
  return [currentValue, setter];
};
