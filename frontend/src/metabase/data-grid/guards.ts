import type { MaybeVirtualRow, VirtualRow } from "./types";

export const isVirtualRow = <TData>(
  maybeVirtualRow: MaybeVirtualRow<TData>,
): maybeVirtualRow is VirtualRow<TData> => "virtualRow" in maybeVirtualRow;
