import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useState } from "react";

import { useUserSetting } from "metabase/common/hooks";
import type { UserSettings } from "metabase-types/api";

export function usePersistJsonViaUserSetting<K extends keyof UserSettings, S>({
  onRestore,
  settingKey,
  debounceMs,
  omitKeys = [],
}: {
  onRestore: (settings: S | null) => void;
  settingKey: K;
  debounceMs: number;
  omitKeys?: (keyof S)[];
}) {
  const [isUserSettingsLoaded, setIsUserSettingsLoaded] = useState(false);
  const [userSettingString, setUserSettingString] = useUserSetting(settingKey);

  const storeSetting = useDebouncedCallback((settings: S) => {
    const sanitizedSettings = _.omit(settings, omitKeys as string[]);

    setUserSettingString(JSON.stringify(sanitizedSettings) as UserSettings[K]);
  }, debounceMs);

  useEffect(() => {
    if (!isUserSettingsLoaded) {
      let settings: S | null = null;

      try {
        settings = JSON.parse(userSettingString as string) as S;
      } catch (error) {}

      onRestore(settings);
      setIsUserSettingsLoaded(true);
    }
  }, [isUserSettingsLoaded, userSettingString, onRestore]);

  return { storeSetting };
}
