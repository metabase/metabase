import { useCallback, useMemo, useState } from "react";

import { SortDirection } from "metabase-types/api/sorting";

import type { BaseRow } from "./types";

const compareNumbers = (a: number, b: number) => a - b;

export const useTableSorting = <Row extends BaseRow>({
  rows,
  defaultSortColumn,
  defaultSortDirection = SortDirection.Asc,
  formatValueForSorting,
  locale,
}: {
  rows: Row[];
  defaultSortColumn?: string;
  defaultSortDirection?: SortDirection;
  formatValueForSorting: (row: Row, columnName: string) => any;
  locale: string;
}) => {
  const [sortColumn, setSortColumn] = useState<string | undefined>(
    defaultSortColumn,
  );
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(defaultSortDirection);

  const compareStrings = useCallback(
    (a: string, b: string) =>
      a.localeCompare(b, locale, { sensitivity: "base" }),
    [locale],
  );

  const sortedRows = useMemo(() => {
    if (sortColumn) {
      return [...rows].sort((rowA, rowB) => {
        const a = formatValueForSorting(rowA, sortColumn);
        const b = formatValueForSorting(rowB, sortColumn);

        if (!isSortableValue(a) || !isSortableValue(b)) {
          return 0;
        }

        const result =
          typeof a === "string"
            ? compareStrings(a, b as string)
            : compareNumbers(a, b as number);
        return sortDirection === SortDirection.Asc ? result : -result;
      });
    }
    return rows;
  }, [rows, sortColumn, sortDirection, formatValueForSorting, compareStrings]);

  return {
    sortColumn,
    sortDirection,
    setSortColumn,
    setSortDirection,
    sortedRows,
  };
};

function isSortableValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
