import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { c } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
} from "metabase-types/api";

import { SAVE_DEBOUNCE_MS } from "../utils";

export function useAdminSettingWithDebouncedInput<T>(
  settingName: EnterpriseSettingKey,
  defaultValue: T | null = null,
) {
  const { value: settingValue, updateSetting } = useAdminSetting(settingName);
  const [inputValue, setInputValue] = useState<T>();
  const { sendErrorToast } = useMetadataToasts();

  // Local input state initialization
  useEffect(() => {
    if (
      inputValue === undefined && // Input has not been initialized
      settingValue !== undefined // and setting has been fetched
    ) {
      setInputValue((settingValue || defaultValue) as T);
    }
  }, [defaultValue, inputValue, settingValue]);

  const debouncedSaveSetting = useDebouncedCallback(async (value: T) => {
    const response = await updateSetting({
      key: settingName,
      value: value as EnterpriseSettingValue<typeof settingName>,
      toast: false,
    });
    if (response.error) {
      sendErrorToast(
        c("{0} is the setting name")
          .t`Failed to update setting: ${settingName}`,
      );
    }
  }, SAVE_DEBOUNCE_MS);

  const handleInputChange = useCallback(
    (newValue: T) => {
      setInputValue(newValue);
      debouncedSaveSetting(newValue);
    },
    [debouncedSaveSetting],
  );

  return {
    inputValue,
    handleInputChange,
  };
}
