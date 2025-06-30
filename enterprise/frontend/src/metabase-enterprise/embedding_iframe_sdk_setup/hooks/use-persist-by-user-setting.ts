import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useState } from "react";

import { useUserSetting } from "metabase/common/hooks";
import type { UserSettings } from "metabase-types/api";

export function usePersistByUserSetting<K extends keyof UserSettings, S>({
  onLoad,
  settingKey,
  debounceMs,
}: {
  onLoad: (settings: S | null) => void;
  settingKey: K;
  debounceMs: number;
}) {
  const [isUserSettingsLoaded, setIsUserSettingsLoaded] = useState(false);
  const [userSettingString, setUserSettingString] = useUserSetting(settingKey);

  const storeSetting = useDebouncedCallback(
    (settings: S) =>
      setUserSettingString(JSON.stringify(settings) as UserSettings[K]),
    debounceMs,
  );

  useEffect(() => {
    if (!isUserSettingsLoaded) {
      let settings: S | null = null;

      try {
        settings = JSON.parse(userSettingString as string) as S;
      } catch (error) {}

      onLoad(settings);
      setIsUserSettingsLoaded(true);
    }
  }, [isUserSettingsLoaded, userSettingString, onLoad]);

  return { storeSetting };
}
