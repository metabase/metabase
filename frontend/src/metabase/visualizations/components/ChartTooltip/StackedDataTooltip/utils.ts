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
