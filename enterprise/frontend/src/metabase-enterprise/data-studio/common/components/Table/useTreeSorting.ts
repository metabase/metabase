import { useCallback, useMemo, useState } from "react";

import { SortDirection } from "metabase-types/api/sorting";

export type BaseRow = Record<string, any> & { id: number | string };

const compareNumbers = (a: number, b: number) => a - b;

export const useTreeSorting = <Row extends BaseRow>({
  data,
  defaultSortColumn,
  defaultSortDirection = SortDirection.Asc,
  formatValueForSorting,
}: {
  data: Row[];
  defaultSortColumn?: string;
  defaultSortDirection?: SortDirection;
  formatValueForSorting: (row: Row, columnName: string) => any;
}) => {
  const [sortColumn, setSortColumn] = useState<string | undefined>(
    defaultSortColumn,
  );
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(defaultSortDirection);

  const compareStrings = useCallback(
    (a: string, b: string) => a.localeCompare(b),
    [],
  );

  const sortItems = useCallback(
    (items: Row[]) => {
      if (sortColumn) {
        return [...items].sort((rowA, rowB) => {
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
      return items;
    },
    [sortColumn, sortDirection, formatValueForSorting, compareStrings],
  );

  const sortTree = (items: Row[]) =>
    sortItems(
      items.map((i) => ({
        ...i,
        children: i.children ? sortTree(i.children) : undefined,
      })),
    );

  const sortedTree = sortTree(data);

  return {
    sortColumn,
    sortDirection,
    setSortColumn,
    setSortDirection,
    sortedTree,
  };
};

function isSortableValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
