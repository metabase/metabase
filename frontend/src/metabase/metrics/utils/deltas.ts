import type { Dataset } from "metabase-types/api";

const VALUE_COLUMN_INDEX = 1;

/** Twelve periods back plus the current one: the same period one year earlier on a monthly series. */
const YEAR_AGO_OFFSET = 13;

export type MetricDeltas = {
  previous: number | null;
  yearAgo: number | null;
};

/**
 * Fractional change of the latest row against the previous row and against the same period a year
 * earlier. `null` whenever the comparison row or either value is missing, or the base is `0` — a
 * metric with no history gets no delta rather than a fake one.
 */
export function getMetricDeltas(dataset: Dataset): MetricDeltas {
  const { rows } = dataset.data;

  return {
    previous: getChange(rows, 2),
    yearAgo: getChange(rows, YEAR_AGO_OFFSET),
  };
}

function getChange(rows: Dataset["data"]["rows"], offset: number) {
  const latest = toNumber(rows.at(-1)?.[VALUE_COLUMN_INDEX]);
  const base = toNumber(rows.at(-offset)?.[VALUE_COLUMN_INDEX]);

  if (latest == null || base == null || base === 0) {
    return null;
  }

  return (latest - base) / Math.abs(base);
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
