import { useCallback, useEffect, useRef } from "react";

import { useAdminSetting } from "metabase/api/utils";
import { useBeforeUnload } from "metabase/common/hooks/use-before-unload";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
} from "metabase-types/api";

import { useHydratedInput } from "./useHydratedInput";

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
  const {
    value: settingValue,
    isLoading,
    updateSetting,
  } = useAdminSetting(settingName);
  const lastSavedRef = useRef(settingValue);

  const { inputValue, setInputValueFromUser: handleInputChange } =
    useHydratedInput({
      value: settingValue,
      isLoading,
      onHydrate: useCallback((value: typeof settingValue) => {
        lastSavedRef.current = value;
      }, []),
    });

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
    handleInputChange,
    handleBlur: save,
  };
}
