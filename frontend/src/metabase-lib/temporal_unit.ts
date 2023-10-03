import * as ML from "cljs/metabase.lib.js";

type IntervalAmount = number | "current" | "next" | "last";

export function describeTemporalInterval(
  n: IntervalAmount,
  unit?: string,
): string {
  return ML.describe_temporal_interval(n, unit);
}

export function describeRelativeDatetime(
  n: IntervalAmount,
  unit?: string,
): string {
  return ML.describe_relative_datetime(n, unit);
}
