import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminSetting } from "metabase/api/utils";
import { useBeforeUnload } from "metabase/common/hooks/use-before-unload";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
} from "metabase-types/api";

type StringSettingKey = {
  [K in EnterpriseSettingKey]: EnterpriseSettings[K] extends
    | string
    | null
    | undefined
    ? K
    : never;
}[EnterpriseSettingKey];

/**
 * Persists a text setting on blur and on unmount. Suited for settings whose
 * saves shouldn't be debounced (e.g. Metabot system prompts).
 */
export function useAdminSettingWithBlurInput(settingName: StringSettingKey) {
  const { value: settingValue, updateSetting } = useAdminSetting(settingName);
  const [inputValue, setInputValue] = useState(settingValue);
  const lastSavedRef = useRef(settingValue);

  useEffect(() => {
    if (lastSavedRef.current === undefined && settingValue !== undefined) {
      setInputValue(settingValue);
      lastSavedRef.current = settingValue;
    }
  }, [settingValue]);

  const trimmedInput = (inputValue ?? "").trim();
  const trimmedSaved = (lastSavedRef.current ?? "").trim();
  const isDirty = trimmedInput !== trimmedSaved;

  useBeforeUnload(isDirty);

  const save = useCallback(() => {
    if (!isDirty) {
      return;
    }
    lastSavedRef.current = trimmedInput;
    updateSetting({ key: settingName, value: trimmedInput });
  }, [isDirty, trimmedInput, settingName, updateSetting]);

  // Track the latest `save` so the unmount cleanup can fire it. Browser back
  // doesn't fire blur on the focused textarea, so the cleanup is what saves.
  const saveRef = useRef(save);
  saveRef.current = save;

  // Persist a pending edit on SPA navigation away.
  useEffect(() => () => saveRef.current(), []);

  return {
    inputValue,
    handleInputChange: setInputValue,
    handleBlur: save,
  };
}
