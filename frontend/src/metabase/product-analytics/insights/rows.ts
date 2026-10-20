import { QUESTION_LABEL_COLUMN } from "../sql/analyses/insights";

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
  const questionIndex = indexOf("k");
  const reachedIndex = indexOf("reached");
  const convertedIndex = indexOf("converted");
  const attributeIndexes = attributeIds
    .map((attributeId) => ({ attributeId, index: indexOf(attributeId) }))
    .filter(({ index }) => index >= 0);

  return rows.flatMap((row) => {
    const question = toCount(row[questionIndex]);
    const reached = toCount(row[reachedIndex]);
    const converted = toCount(row[convertedIndex]);
    if (
      question === undefined ||
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
    return [{ question, reached, converted, conditions }];
  });
};

/**
 * Each question's label, from a singles query over a population with labels.
 * Empty when it has none.
 */
export const parseQuestionLabels = (
  columnNames: readonly string[],
  rows: readonly (readonly unknown[])[],
): Map<number, string> => {
  const questionIndex = columnNames.indexOf("k");
  const labelIndex = columnNames.indexOf(QUESTION_LABEL_COLUMN);
  if (labelIndex < 0) {
    return new Map();
  }
  return new Map(
    rows.flatMap((row) => {
      const question = toCount(row[questionIndex]);
      const label = row[labelIndex];
      return question !== undefined && typeof label === "string"
        ? [[question, label] as const]
        : [];
    }),
  );
};
