import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminSetting } from "metabase/api/utils";
import { useBeforeUnload } from "metabase/common/hooks/use-before-unload";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
} from "metabase-types/api";

/**
 * Persists a text setting on blur and on unmount. Suited for settings whose
 * saves shouldn't be debounced (e.g. Metabot system prompts).
 */
export function useAdminSettingWithBlurInput<K extends EnterpriseSettingKey>(
  settingName: K,
) {
  const { value: settingValue, updateSetting } = useAdminSetting(settingName);
  const [inputValue, setInputValue] =
    useState<EnterpriseSettings[K]>(settingValue);
  const lastSavedRef = useRef<EnterpriseSettings[K] | undefined>(settingValue);

  useEffect(() => {
    if (lastSavedRef.current === undefined && settingValue !== undefined) {
      setInputValue(settingValue);
      lastSavedRef.current = settingValue;
    }
  }, [settingValue]);

  const isDirty = (inputValue || "") !== (lastSavedRef.current || "");

  useBeforeUnload(isDirty);

  const save = useCallback(() => {
    if (!isDirty) {
      return;
    }
    lastSavedRef.current = inputValue;
    updateSetting({
      key: settingName,
      value: inputValue,
    });
  }, [isDirty, inputValue, settingName, updateSetting]);

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
