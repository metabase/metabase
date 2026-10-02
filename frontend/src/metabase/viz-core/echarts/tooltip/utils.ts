import type { TooltipRowModel } from "../../types";

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

export const getSortedRows = <TRow extends TooltipRowModel>(rows: TRow[]) => {
  return [...rows].sort(({ value: leftValue }, { value: rightValue }) => {
    return (
      (typeof rightValue === "number" ? rightValue : 0) -
      (typeof leftValue === "number" ? leftValue : 0)
    );
  });
};
