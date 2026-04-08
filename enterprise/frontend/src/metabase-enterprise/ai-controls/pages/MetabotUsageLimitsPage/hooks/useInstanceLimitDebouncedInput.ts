import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useGetAIControlsInstanceLimitQuery,
  useUpdateAIControlsInstanceLimitMutation,
} from "metabase-enterprise/api";

import { SAVE_DEBOUNCE_MS } from "../utils";

export function useInstanceLimitDebouncedInput() {
  const { data: settingValue } = useGetAIControlsInstanceLimitQuery();
  const [updateInstanceLimit] = useUpdateAIControlsInstanceLimitMutation();
  const initialInstanceLimit = settingValue?.max_usage;
  const [instanceLimit, setInstanceLimit] = useState<number | null>();
  const { sendErrorToast } = useMetadataToasts();

  useEffect(() => {
    // Initialize instance limit local state
    if (instanceLimit === undefined && initialInstanceLimit !== undefined) {
      setInstanceLimit(initialInstanceLimit);
    }
  }, [initialInstanceLimit, instanceLimit]);

  const debouncedSaveInstanceLimit = useDebouncedCallback(
    async (maxUsage: number | null) => {
      try {
        await updateInstanceLimit({ max_usage: maxUsage }).unwrap();
      } catch {
        sendErrorToast(t`Failed to update instance limit`);
      }
    },
    SAVE_DEBOUNCE_MS,
  );

  const handleInstanceLimitInputChange = useCallback(
    (maxUsage: number | null) => {
      setInstanceLimit(maxUsage);
      debouncedSaveInstanceLimit(maxUsage);
    },
    [debouncedSaveInstanceLimit],
  );

  return {
    instanceLimit,
    handleInstanceLimitInputChange,
  };
}
