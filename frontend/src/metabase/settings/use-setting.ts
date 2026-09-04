import { useCallback, useMemo } from "react";
import _ from "underscore";

import { useSelector } from "metabase/redux";
import type { EnterpriseSettingKey, UserSettings } from "metabase-types/api";

import {
  type UpdateSettingArg,
  useUpdateSettingMutation,
  useUpdateUserSettingMutation,
} from "./api";
import { getSetting } from "./selectors";

export const useSetting = <SettingName extends EnterpriseSettingKey>(
  settingName: SettingName,
) => {
  return useSelector((state) => getSetting(state, settingName));
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
  // `shouldRefresh` chooses between pessimistic (invalidate + refetch all settings)
  //  vs optimistic (patch the one value, no refetch).
  const [updateSetting] = useUpdateSettingMutation();
  const [updateUserSetting] = useUpdateUserSettingMutation();
  const setter = useCallback(
    (value: UserSettings[T]) => {
      const mutate = shouldRefresh ? updateSetting : updateUserSetting;
      // Annotate the argument with the mutations' concrete input type. Passing
      // the object literal directly would make TypeScript infer through the
      // generic RTK trigger types, which hits the instantiation depth limit (TS2589).
      const args: UpdateSettingArg = { key, value };
      mutate(args);
    },
    [updateSetting, updateUserSetting, key, shouldRefresh],
  );
  const debouncedSetter = useMemo(
    () => _.debounce(setter, debounceTimeout, debounceOnLeadingEdge),
    [setter, debounceTimeout, debounceOnLeadingEdge],
  );
  return [currentValue, shouldDebounce ? debouncedSetter : setter];
};
