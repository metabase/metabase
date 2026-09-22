import { isPositiveInteger, isRecord } from "./guards";

/**
 * Finds saved-question IDs used as sources anywhere in a query, including joins and nested stages.
 * Supports `source-card` IDs and legacy `source-table: "card__<id>"` references.
 */
export function getSavedCardSourceIds(
  query: unknown,
  ids = new Set<number>(),
): Set<number> {
  if (Array.isArray(query)) {
    query.forEach((item) => getSavedCardSourceIds(item, ids));
  } else if (isRecord(query)) {
    Object.entries(query).forEach(([key, value]) => {
      if (key === "source-card" && isPositiveInteger(value)) {
        ids.add(value);
      } else if (key === "source-table" && typeof value === "string") {
        const match = /^card__(\d+)$/.exec(value);
        const id = match && Number(match[1]);

        if (isPositiveInteger(id)) {
          ids.add(id);
        }
      }

      getSavedCardSourceIds(value, ids);
    });
  }

  return ids;
}
