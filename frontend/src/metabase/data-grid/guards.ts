import type { MaybeVirtualRow, VirtualRow } from "./types";

export const isVirtualRow = <TData>(
  maybeVirtualRow: MaybeVirtualRow<TData>,
): maybeVirtualRow is VirtualRow<TData> => {
  return "virtualRow" in maybeVirtualRow;
};
