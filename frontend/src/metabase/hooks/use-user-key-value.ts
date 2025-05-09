import { useCallback } from "react";

import {
  skipToken,
  useDeleteUserKeyValueMutation,
  useGetUserKeyValueQuery,
  useUpdateKeyValueMutation,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
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
  const user = useSelector(getUser);

  const {
    data: valueFromQuery,
    isLoading: queryIsLoading,
    error: fetchError,
  } = useGetUserKeyValueQuery(user ? { namespace, key } : skipToken);

  const [setMutation, setMutationReq] = useUpdateKeyValueMutation();
  const setValue = useCallback(
    async (value: T["value"]) => {
      if (!user) {
        return { error: "No user" };
      }
      return await setMutation({ namespace, key, value });
    },
    [setMutation, namespace, key, user],
  );

  const [clearMutation, clearMutationReq] = useDeleteUserKeyValueMutation();
  const clearValue = useCallback(async () => {
    if (!user) {
      return { error: "No user" };
    }
    return await clearMutation({ namespace, key });
  }, [clearMutation, namespace, key, user]);

  const isMutating = setMutationReq.isLoading || clearMutationReq.isLoading;
  const error = fetchError ?? setMutationReq.error ?? clearMutationReq.error;

  return {
    value: user ? (valueFromQuery ?? defaultValue) : defaultValue,
    setValue,
    clearValue,
    isLoading: user ? queryIsLoading : false,
    isMutating: user ? isMutating : false,
    error: user ? error : false,
  };
}
