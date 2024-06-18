import { useCallback, useMemo } from "react";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";
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
