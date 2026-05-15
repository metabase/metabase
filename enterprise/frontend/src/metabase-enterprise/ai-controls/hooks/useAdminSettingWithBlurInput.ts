import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminSetting } from "metabase/api/utils";
import { useBeforeUnload } from "metabase/common/hooks/use-before-unload";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
} from "metabase-types/api";

/**
 * Persists a setting on blur and on unmount instead of on every keystroke.
 * For text settings whose saves shouldn't be debounced (e.g. Metabot system
 * prompts, where each save changes LLM behavior and the audit log).
 *
 * Dirty check uses `===` - safe for primitive setting values only.
 */
export function useAdminSettingWithBlurInput<K extends EnterpriseSettingKey>(
  settingName: K,
) {
  const { value: settingValue, updateSetting } = useAdminSetting(settingName);
  const [inputValue, setInputValue] =
    useState<EnterpriseSettings[K]>(settingValue);
  const lastSavedRef = useRef<EnterpriseSettings[K] | undefined>(undefined);

  // `lastSavedRef.current === undefined` is the "not yet initialized" sentinel.
  useEffect(() => {
    if (lastSavedRef.current === undefined && settingValue !== undefined) {
      setInputValue(settingValue);
      lastSavedRef.current = settingValue;
    }
  }, [settingValue]);

  const isDirty = inputValue !== lastSavedRef.current;

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

  // Mirror `save` so blur / unmount can read the latest closure without
  // re-binding handlers on every keystroke.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Browsers won't wait for async saves during unload, so prompt the user.
  useBeforeUnload(isDirty);

  const handleBlur = useCallback(() => {
    saveRef.current();
  }, []);

  // Persist a pending edit on SPA navigation away.
  useEffect(() => {
    return () => {
      saveRef.current();
    };
  }, []);

  return {
    inputValue,
    handleInputChange: setInputValue,
    handleBlur,
  };
}
