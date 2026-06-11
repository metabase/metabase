import { useCallback } from "react";

import {
  skipToken,
  useDeleteUserKeyValueMutation,
  useGetUserKeyValueQuery,
  useUpdateKeyValueMutation,
} from "metabase/api";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import type {
  UpdateUserKeyValueRequest,
  UserKeyValue,
} from "metabase-types/api";

type UserKeyValueNamespace<Namespace extends UserKeyValue["namespace"]> =
  Extract<UserKeyValue, { namespace: Namespace }>;

type ExactUserKeyValue<
  Namespace extends UserKeyValue["namespace"],
  Key extends string,
> = Extract<UserKeyValueNamespace<Namespace>, { key: Key }>;

type UserKeyValueFor<Params extends Pick<UserKeyValue, "namespace" | "key">> = [
  ExactUserKeyValue<Params["namespace"], Params["key"]>,
] extends [never]
  ? UserKeyValueNamespace<Params["namespace"]> extends infer NamespaceMatch
    ? NamespaceMatch extends UserKeyValue
      ? Params["key"] extends NamespaceMatch["key"]
        ? NamespaceMatch
        : never
      : never
    : never
  : ExactUserKeyValue<Params["namespace"], Params["key"]>;

export type UseUserKeyValueParams<
  Params extends Pick<UserKeyValue, "namespace" | "key"> = UserKeyValue,
> = {
  namespace: Params["namespace"];
  key: Params["key"];
  defaultValue?: UserKeyValueFor<Params>["value"];
  skip?: boolean;
};

type UseUserKeyValueImplementationParams<T extends UserKeyValue> = {
  namespace: T["namespace"];
  key: T["key"];
  defaultValue?: T["value"];
  skip?: boolean;
};

export type UseUserKeyValueResult<T extends UserKeyValue> = {
  value: T["value"];
  /**
   * Like `value`, but reflects only the result for the current `(namespace,
   * key)` args. While a new subscription is settling after args change,
   * `value` "sticks" to the previous args' result (RTK Query's `data`
   * field), which can leak stale state into consumers that read it
   * synchronously during render. `currentValue` is `undefined` during that
   * transition window — use it when staleness across key changes matters.
   */
  currentValue: T["value"] | undefined;
  setValue: (value: T["value"]) => Promise<{ data?: unknown; error?: unknown }>;
  isLoading: boolean;
  isMutating: boolean;
  error: unknown;
  clearValue: () => Promise<{ data?: unknown; error?: unknown }>;
};

export function useUserKeyValue<
  Namespace extends UserKeyValue["namespace"],
  Key extends string,
>(params: {
  namespace: Namespace;
  key: Key;
  defaultValue?: UserKeyValueFor<{ namespace: Namespace; key: Key }>["value"];
  skip?: boolean;
}): UseUserKeyValueResult<UserKeyValueFor<{ namespace: Namespace; key: Key }>>;
export function useUserKeyValue<T extends UserKeyValue>({
  namespace,
  key,
  defaultValue,
  skip = false,
}: UseUserKeyValueImplementationParams<T>): UseUserKeyValueResult<T> {
  const user = useSelector(getUser) ?? null;

  const queryParams = user && !skip ? { namespace, key } : skipToken;
  const {
    data: valueFromQuery,
    currentData: currentValueFromQuery,
    isLoading: queryIsLoading,
    error: fetchError,
  } = useGetUserKeyValueQuery(queryParams);

  const [setMutation, setMutationReq] = useUpdateKeyValueMutation();
  const setValue = useCallback(
    async (value: T["value"]) => {
      if (!user) {
        return { error: "No user" };
      }
      // The implementation signature uses `T extends UserKeyValue`, which
      // doesn't preserve the correlation between `namespace`, `key`, and
      // `value` across the union — TypeScript widens the constructed object
      // to a cross-product and rejects it against the per-variant
      // `UpdateUserKeyValueRequest`. The runtime call is correct because
      // the public overload signature constrains the inputs, so cast here
      // to bridge the body-level type loss.
      return await setMutation({
        namespace,
        key,
        value,
      } as UpdateUserKeyValueRequest);
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

  // For a non-existing key the API resolves the empty response body to `null`,
  // so `defaultValue` is applied here. (RTK Query reports `undefined` only while
  // the request is in flight, which also falls back to `defaultValue`.)
  return {
    value: user ? (valueFromQuery ?? defaultValue) : defaultValue,
    currentValue: user ? currentValueFromQuery : undefined,
    setValue,
    clearValue,
    isLoading: user ? queryIsLoading : false,
    isMutating: user ? isMutating : false,
    error: user ? error : false,
  };
}
