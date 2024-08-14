import { t } from "ttag";

import type { TooltipRowModel } from "metabase/visualizations/types";

export const getTotalValue = (
  headerRows: TooltipRowModel[] = [],
  bodyRows: TooltipRowModel[] = [],
) => {
  return [...headerRows, ...bodyRows].reduce((sum, row) => {
    const value = typeof row.value === "number" ? row.value : 0;
    return sum + value;
  }, 0);
};

export const getPercent = (total: number, value: unknown) => {
  if (typeof value !== "number") {
    return undefined;
  }

  return value / Math.abs(total);
};

export const groupExcessiveTooltipRows = (
  rows: TooltipRowModel[],
  maxRows: number,
  groupedColor?: string,
) => {
  if (rows.length <= maxRows) {
    return rows;
  }

  const groupStartingFromIndex = maxRows - 1;
  const rowsToKeep = rows.slice(0, groupStartingFromIndex);
  const rowsToGroup = rows.slice(groupStartingFromIndex);

  const groupedRow = rowsToGroup.reduce(
    (grouped, current) => {
      if (
        typeof current.value === "number" &&
        typeof grouped.value === "number"
      ) {
        grouped.value += current.value;
      }
      return grouped;
    },
    {
      color: groupedColor,
      name: t`Other`,
      value: 0,
      formatter: rowsToGroup[0].formatter,
    },
  );

  return [...rowsToKeep, groupedRow];
};

export const getSortedRows = (rows: TooltipRowModel[]) => {
  return [...rows].sort(({ value: leftValue }, { value: rightValue }) => {
    return (
      (typeof rightValue === "number" ? rightValue : 0) -
      (typeof leftValue === "number" ? leftValue : 0)
    );
  });
};
