import { isPositiveInteger } from "./guards";

export function collectTableIds(
  values: ReadonlyArray<Record<string, unknown>>,
): number[] {
  const tableIds = new Set<number>();

  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collect);

      return;
    }

    if (value === null || typeof value !== "object") {
      return;
    }

    Object.entries(value).forEach(([key, item]) => {
      if (key === "source-table" && isPositiveInteger(item)) {
        tableIds.add(item);
      }

      collect(item);
    });
  };

  values.forEach(collect);

  return [...tableIds].sort((a, b) => a - b);
}
