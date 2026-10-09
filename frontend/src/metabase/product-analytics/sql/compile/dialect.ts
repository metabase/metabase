import type { Granularity } from "../../spec/types";

/**
 * ClickHouse honours backslash escapes inside string literals, so a backslash
 * must be escaped before the quotes are — otherwise `C:\path` is reinterpreted
 * and a trailing backslash escapes the closing quote and breaks out entirely.
 */
export const lit = (value: string): string =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;

export const num = (value: string | number): string => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "0";
};

export const INTERVAL: Record<Granularity, string> = {
  hour: "1 HOUR",
  day: "1 DAY",
  week: "1 WEEK",
  month: "1 MONTH",
};

export const bucket = (expr: string, granularity: Granularity): string =>
  `toStartOfInterval(${expr}, INTERVAL ${INTERVAL[granularity]})`;
