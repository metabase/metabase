import { useCallback, useMemo } from "react";
import _ from "underscore";

// Don't touch this import or the auth page will break. referring to the barrel doesn't work right now
import { getAdminSettingDefinitions } from "metabase/admin/settings/selectors/typed-selectors";
import type { SettingElement } from "metabase/admin/settings/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateUserSetting } from "metabase/redux/settings";
import { getSetting } from "metabase/selectors/settings";
import type {
  SettingDefinition,
  SettingKey,
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

export const useMergeSetting = <Key extends SettingKey>(
  displaySetting: SettingElement<Key>,
): SettingElement<Key> => {
  const settingDefinitions = useSelector(getAdminSettingDefinitions);
  const apiSetting = settingDefinitions.find(
    (setting: SettingDefinition) => setting.key === displaySetting.key,
  ) as SettingDefinition<Key> | undefined;

  const mergedSetting: SettingElement<Key> = useMemo(() => {
    return {
      ...(apiSetting ?? {}),
      ...displaySetting,
    };
  }, [apiSetting, displaySetting]);

  return mergedSetting;
};
