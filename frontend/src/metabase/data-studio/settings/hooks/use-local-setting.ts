import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { useUpdateSettingMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
} from "metabase-types/api";

export function useLocalSetting<
  K extends EnterpriseSettingKey,
  V extends EnterpriseSettingValue<K>,
>(key: K, value: V) {
  const [localValue, setLocalValue] = useState<V>(value);
  const previousValueRef = useRef<V>(value);
  const [updateSetting, { isLoading: isUpdating }] = useUpdateSettingMutation();
  const [sendToast] = useToast();

  const handleChange = useCallback(
    async (value: V) => {
      setLocalValue(value);
      const { error } = await updateSetting({ key, value });
      if (error) {
        sendToast({
          message: t`Failed to update setting`,
          icon: "warning_triangle_filled",
          iconColor: "warning",
        });
        setLocalValue(previousValueRef.current);
        return;
      }
      previousValueRef.current = value;
    },
    [updateSetting, sendToast, key],
  );

  return {
    value: localValue,
    handleChange,
    isUpdating,
  };
}
