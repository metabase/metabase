import type { Column } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";

import type { MaybeVirtualRow, VirtualRow } from "./types";

export const isVirtualRow = <TData>(
  maybeVirtualRow: MaybeVirtualRow<TData>,
): maybeVirtualRow is VirtualRow<TData> => "virtualRow" in maybeVirtualRow;

export const isVirtualColumn = <TData>(
  column: VirtualItem | Column<TData>,
): column is VirtualItem => "start" in column;
