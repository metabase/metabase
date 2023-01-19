import { TooltipRowModel } from "../types";

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

  return value / total;
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
  const result = rows.slice();
  const rowsToGroup = result.splice(groupStartingFromIndex);

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
      name: `Other`,
      value: 0,
      formatter: rowsToGroup[0].formatter,
    },
  );

  return [...result, groupedRow];
};
