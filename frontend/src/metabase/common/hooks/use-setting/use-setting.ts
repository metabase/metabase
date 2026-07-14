import { useCallback, useMemo } from "react";
import _ from "underscore";

import {
  useUpdateSettingMutation,
  useUpdateUserSettingMutation,
} from "metabase/api";
import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
import type { EnterpriseSettingKey, UserSettings } from "metabase-types/api";

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
  // `shouldRefresh` chooses the mutation: pessimistic (invalidate + refetch all
  // settings) vs optimistic (patch the one value, no refetch).
  const [updateSetting] = useUpdateSettingMutation();
  const [updateUserSetting] = useUpdateUserSettingMutation();
  const setter = useCallback(
    (value: UserSettings[T]) => {
      const mutate = shouldRefresh ? updateSetting : updateUserSetting;
      // Unjustified type cast. FIXME
      mutate({ key, value } as Parameters<typeof updateSetting>[0]);
    },
    [updateSetting, updateUserSetting, key, shouldRefresh],
  );
  const debouncedSetter = useMemo(
    () => _.debounce(setter, debounceTimeout, debounceOnLeadingEdge),
    [setter, debounceTimeout, debounceOnLeadingEdge],
  );
  return [currentValue, shouldDebounce ? debouncedSetter : setter];
};
