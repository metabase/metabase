import { useCallback, useMemo } from "react";
import _ from "underscore";

import { updateSetting } from "metabase/admin/settings/settings";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateUserSetting } from "metabase/redux/settings";
import { getSetting } from "metabase/selectors/settings";
import type {
  SettingElement,
  SettingElementKey,
  SettingKey,
  UpdateSettingValue,
  UserSettings,
} from "metabase-types/api";

export const useSetting = <SettingName extends SettingKey>(
  settingName: SettingName,
) => {
  return useSelector(state => getSetting(state, settingName));
};

export const useUserSetting = <T extends keyof UserSettings>(
  key: T,
  {
    shouldRefresh = false,
    shouldDebounce = true,
    debounceTimeout = 200,
    debounceOnLeadingEdge,
  }: {
    shouldRefresh?: boolean;
    shouldDebounce?: boolean;
    debounceTimeout?: number;
    debounceOnLeadingEdge?: boolean;
  } = {},
): [UserSettings[T], (value: UserSettings[T]) => void] => {
  const currentValue = useSetting(key);
  const dispatch = useDispatch();
  const setter = useCallback(
    (value: UserSettings[T]) => {
      dispatch(updateUserSetting({ key, value, shouldRefresh }));
    },
    [dispatch, key, shouldRefresh],
  );
  const debouncedSetter = useMemo(
    () => _.debounce(setter, debounceTimeout, debounceOnLeadingEdge),
    [setter, debounceTimeout, debounceOnLeadingEdge],
  );
  return [currentValue, shouldDebounce ? debouncedSetter : setter];
};

export function useMergeSetting<Key extends SettingElementKey>(
  displaySetting: Partial<SettingElement<Key>>,
): SettingElement<Key> {
  const apiSetting = useSelector(state => state.admin.settings.settings).find(
    setting => setting.key === displaySetting.key,
  ) as SettingElement<Key>;
  const mergedSetting = useMemo(() => {
    return {
      ...apiSetting,
      ...displaySetting,
    };
  }, [apiSetting, displaySetting]);

  return mergedSetting;
}

export const useGetSetSetting = <Key extends SettingElementKey>(
  displaySetting: Partial<SettingElement<Key>>,
): [SettingElement<Key>, UpdateSettingValue] => {
  const mergedSetting = useMergeSetting(displaySetting);

  const dispatch = useDispatch();

  const handleSettingChange: UpdateSettingValue = value => {
    dispatch(updateSetting({ key: displaySetting.key, value }));
  };

  // used to match useState's get/set pattern with array values
  return [mergedSetting, handleSettingChange];
};
