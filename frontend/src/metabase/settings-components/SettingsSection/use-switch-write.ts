import { useEffect, useState } from "react";

type PendingWrite = { value: boolean; at: number };

type UseSwitchWriteOptions = {
  storedValue: boolean;
  // true while the source of the stored value is refetching
  isFetching: boolean;
  // when the source last started loading, so an older refetch cannot bring the previous value back
  startedTimeStamp: number | undefined;
  // resolves to whether the value was saved
  write: (value: boolean) => Promise<boolean>;
};

export type SwitchWriteState = {
  checked: boolean;
  onChange: (value: boolean) => Promise<void>;
};

/** Shows a switch's clicked value until a refetch started after the write carries it, and drops it when the write fails */
export function useSwitchWrite({
  storedValue,
  isFetching,
  startedTimeStamp,
  write,
}: UseSwitchWriteOptions): SwitchWriteState {
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);

  useEffect(() => {
    if (
      pendingWrite != null &&
      !isFetching &&
      startedTimeStamp != null &&
      startedTimeStamp >= pendingWrite.at
    ) {
      setPendingWrite(null);
    }
  }, [pendingWrite, isFetching, startedTimeStamp]);

  const onChange = async (value: boolean) => {
    const pending = { value, at: Date.now() };
    setPendingWrite(pending);
    const saved = await write(value);
    if (!saved) {
      setPendingWrite((current) => (current === pending ? null : current));
    }
  };

  return { checked: pendingWrite?.value ?? storedValue, onChange };
}
