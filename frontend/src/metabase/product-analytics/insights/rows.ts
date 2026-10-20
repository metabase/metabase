import type { GroupCounts } from "./types";

export const toCount = (value: unknown): number | undefined => {
  // Counts can arrive as strings when a 64-bit integer is serialised as JSON.
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed)
    ? parsed
    : undefined;
};

/**
 * Reads the rows of an insights counts query. An empty attribute value means
 * the row doesn't group by that attribute. Rows that can't be read are skipped.
 */
export const parseCountRows = (
  columnNames: readonly string[],
  rows: readonly (readonly unknown[])[],
  attributeIds: readonly string[],
): GroupCounts[] => {
  const indexOf = (name: string) => columnNames.indexOf(name);
  const transitionIndex = indexOf("k");
  const reachedIndex = indexOf("reached");
  const convertedIndex = indexOf("converted");
  const attributeIndexes = attributeIds
    .map((attributeId) => ({ attributeId, index: indexOf(attributeId) }))
    .filter(({ index }) => index >= 0);

  return rows.flatMap((row) => {
    const transition = toCount(row[transitionIndex]);
    const reached = toCount(row[reachedIndex]);
    const converted = toCount(row[convertedIndex]);
    if (
      transition === undefined ||
      reached === undefined ||
      converted === undefined
    ) {
      return [];
    }
    const conditions = attributeIndexes.flatMap(({ attributeId, index }) => {
      const value = row[index];
      return typeof value === "string" && value !== ""
        ? [{ attributeId, value }]
        : [];
    });
    return [{ transition, reached, converted, conditions }];
  });
};
