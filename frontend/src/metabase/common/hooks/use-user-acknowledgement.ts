import { useCallback } from "react";

import { useUserKeyValue } from "./use-user-key-value";

type UseUserAcknowledgementResult = [
  acknowledged: boolean,
  { ack: () => void; unack: () => void; isLoading: boolean },
];

export const useUserAcknowledgement = (
  key: string,
  defaultValue = false,
): UseUserAcknowledgementResult => {
  const {
    value: acked,
    setValue,
    clearValue,
    isLoading,
  } = useUserKeyValue({
    namespace: "user_acknowledgement",
    key,
    defaultValue,
  });

  const ack = useCallback(() => {
    setValue(true);
  }, [setValue]);

  const unack = useCallback(() => {
    clearValue();
  }, [clearValue]);

  return [acked, { ack, unack, isLoading }];
};
