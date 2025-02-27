import { useCallback } from "react";

import {
  useDeleteUserKeyValueMutation,
  useGetUserKeyValueQuery,
  useUpdateKeyValueMutation,
} from "metabase/api";
import type { UserKeyValue } from "metabase-types/api";

export interface UseUserKeyValueParams<T extends UserKeyValue> {
  namespace: T["namespace"];
  key: T["key"];
  defaultValue?: T["value"];
}

export type UseUserKeyValueResult<T extends UserKeyValue> = {
  value: T["value"];
  setValue: (value: T["value"]) => Promise<{ data?: unknown; error?: unknown }>;
  isLoading: boolean;
  isMutating: boolean;
  error: unknown;
  clearValue: () => Promise<{ data?: unknown; error?: unknown }>;
};

export function useUserKeyValue<T extends UserKeyValue>({
  namespace,
  key,
  defaultValue,
}: UseUserKeyValueParams<T>): UseUserKeyValueResult<T> {
  const {
    data: value = defaultValue,
    isLoading,
    error: fetchError,
  } = useGetUserKeyValueQuery({ namespace, key });

  const [setMutation, setMutationReq] = useUpdateKeyValueMutation();
  const setValue = useCallback(
    async (value: T["value"]) => {
      return await setMutation({ namespace, key, value });
    },
    [setMutation, namespace, key],
  );

  const [clearMutation, clearMutationReq] = useDeleteUserKeyValueMutation();
  const clearValue = useCallback(async () => {
    return await clearMutation({ namespace, key });
  }, [clearMutation, namespace, key]);

  return {
    value,
    setValue,
    clearValue,
    isLoading,
    isMutating: setMutationReq.isLoading || clearMutationReq.isLoading,
    error: fetchError ?? setMutationReq.error ?? clearMutationReq.error,
  };
}
