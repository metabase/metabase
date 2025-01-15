import { useCallback } from "react";
import { useUserKeyValue } from "./use-user-key-value";

type UseUserAcknowledgementResult = [boolean, () => void, () => void];

export const useUserAcknowledgement = (
  key: string,
  defaultValue = false,
): UseUserAcknowledgementResult => {
  const {
    value: acked,
    setValue,
    clearValue,
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

  return [acked, ack, unack];
};
