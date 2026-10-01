import type { SortingState } from "@tanstack/react-table";

import type { PolicyTableRowBase } from "./PolicyTable";

export const DEFAULT_POLICY_TABLE_SORTING: SortingState = [
  { id: "name", desc: false },
];

const getSortValue = <TRow extends PolicyTableRowBase>(
  row: TRow,
  columnId: string,
) => {
  switch (columnId) {
    case "collection":
      return row.collection?.name ?? "";
    case "policy":
      return row.policyLabel ?? "";
    default:
      return row.name;
  }
};

export const sortPolicyRows = <TRow extends PolicyTableRowBase>(
  rows: TRow[],
  sorting: SortingState,
): TRow[] => {
  const { id: columnId = "name", desc = false } = sorting[0] ?? {};

  return [...rows].sort(
    (rowA, rowB) =>
      getSortValue(rowA, columnId).localeCompare(getSortValue(rowB, columnId)) *
      (desc ? -1 : 1),
  );
};

export const getAdjacentRows = <TRow>(rows: TRow[], index: number) => ({
  previousRow: index > 0 ? rows[index - 1] : undefined,
  nextRow:
    index !== -1 && index < rows.length - 1 ? rows[index + 1] : undefined,
});
