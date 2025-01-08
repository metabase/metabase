import { useCallback } from "react";

import {
  useDeleteUserKeyValueMutation,
  useGetUserKeyValueQuery,
  useUpdateKeyValueMutation,
} from "metabase/api";

export interface UseUserKeyValueParams<ValueType> {
  namespace: string;
  key: string;
  defaultValue?: ValueType;
}

export type UseUserKeyValueResult<ValueType> = [
  value: ValueType,
  setValue: (value: ValueType) => Promise<{ data?: unknown; error?: unknown }>,
  {
    isLoading: boolean;
    isMutating: boolean;
    error: unknown;
    clearValue: () => Promise<{ data?: unknown; error?: unknown }>;
  },
];

export function useUserKeyValue<ValueType>({
  namespace,
  key,
  defaultValue,
}: UseUserKeyValueParams<ValueType>): UseUserKeyValueResult<ValueType> {
  const {
    data: value = defaultValue,
    isLoading,
    error: fetchError,
  } = useGetUserKeyValueQuery({ namespace, key });

  const [setMutation, setMutationReq] = useUpdateKeyValueMutation();
  const setValue = useCallback(
    async (value: ValueType) => {
      return await setMutation({ namespace, key, value });
    },
    [setMutation, namespace, key],
  );

  const [clearMutation, clearMutationReq] = useDeleteUserKeyValueMutation();
  const clearValue = useCallback(async () => {
    return await clearMutation({ namespace, key });
  }, [clearMutation, namespace, key]);

  return [
    value,
    setValue,
    {
      isLoading,
      isMutating: setMutationReq.isLoading || clearMutationReq.isLoading,
      error: fetchError ?? setMutationReq.error ?? clearMutationReq.error,
      clearValue,
    },
  ];
}
