import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useRef } from "react";

import { useUserSetting } from "metabase/common/hooks";
import type { UserSettings } from "metabase-types/api";

export function usePersistByUserSetting<K extends keyof UserSettings, S>({
  onLoad,
  settingKey,
  debounceMs,
}: {
  onLoad: (settings: S) => void;
  settingKey: K;
  debounceMs: number;
}) {
  const loadedRef = useRef(false);

  const [userSettingString, setUserSettingString] = useUserSetting(settingKey);

  const storeSetting = useDebouncedCallback(
    (settings: S) =>
      setUserSettingString(JSON.stringify(settings) as UserSettings[K]),
    debounceMs,
  );

  useEffect(() => {
    if (loadedRef.current || !userSettingString) {
      return;
    }

    loadedRef.current = true;

    try {
      const parsedSettings = JSON.parse(userSettingString as string) as S;

      if (parsedSettings) {
        onLoad(parsedSettings);
      }
    } catch (error) {}
  }, [userSettingString, onLoad]);

  return { storeSetting };
}
