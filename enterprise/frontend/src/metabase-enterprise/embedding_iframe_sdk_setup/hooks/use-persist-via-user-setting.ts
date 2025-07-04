import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useState } from "react";
import _ from "underscore";

import { useUserSetting } from "metabase/common/hooks";
import type { UserSettings } from "metabase-types/api";

type HookProps<K extends keyof UserSettings, S> = {
  /** Callback to restore the settings from the user setting. */
  onRestore: (settings: S | null) => void;

  /** The key of the user setting to persist. The setting must be a JSON string. */
  settingKey: K;

  /** How long to debounce before saving the settings. */
  debounceMs: number;

  /** Omit these setting keys from being persisted. */
  omitKeys?: (keyof S)[];

  /** Do not restore the settings yet when `skipRestore` is true. */
  skipRestore?: boolean;
};

export function usePersistJsonViaUserSetting<K extends keyof UserSettings, S>({
  onRestore,
  settingKey,
  debounceMs,
  omitKeys = [],
  skipRestore,
}: HookProps<K, S>) {
  const [isUserSettingsLoaded, setIsUserSettingsLoaded] = useState(false);
  const [userSettingString, setUserSettingString] = useUserSetting(settingKey);

  const storeSetting = useDebouncedCallback((settings: S) => {
    const sanitizedSettings = _.omit(settings, omitKeys as string[]);

    setUserSettingString(JSON.stringify(sanitizedSettings) as UserSettings[K]);
  }, debounceMs);

  useEffect(() => {
    if (!isUserSettingsLoaded && !skipRestore) {
      let settings: S | null = null;

      try {
        settings = JSON.parse(userSettingString as string) as S;
      } catch (error) {}

      onRestore(settings);
      setIsUserSettingsLoaded(true);
    }
  }, [isUserSettingsLoaded, userSettingString, onRestore, skipRestore]);

  return { storeSetting };
}
