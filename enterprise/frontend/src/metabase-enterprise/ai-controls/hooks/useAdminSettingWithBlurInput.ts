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
  const isFocusedRef = useRef(false);

  // `lastSavedRef.current === undefined` is the "not yet initialized" sentinel.
  useEffect(() => {
    if (lastSavedRef.current === undefined && settingValue !== undefined) {
      setInputValue(settingValue);
      lastSavedRef.current = settingValue;
    }
  }, [settingValue]);

  // Treat null/undefined/"" as equivalent so a stray onChange event (e.g.
  // Mantine syncing a controlled input with `value={null}`) doesn't mark the
  // setting dirty when the user hasn't actually changed anything.
  const isDirty = (inputValue ?? "") !== (lastSavedRef.current ?? "");

  const save = useCallback(() => {
    // Only save while the field is part of an active focus session: real user
    // input always happens between focus and blur. Outside that window (unmount
    // long after blur, stray onChange events), skip the save.
    if (!isFocusedRef.current || !isDirty) {
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

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const handleBlur = useCallback(() => {
    // Run save while still considered focused, then clear the flag so a later
    // unmount won't save again.
    saveRef.current();
    isFocusedRef.current = false;
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
    handleFocus,
    handleBlur,
  };
}
