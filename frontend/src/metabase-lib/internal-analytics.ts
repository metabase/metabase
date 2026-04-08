import * as ML from "cljs/metabase.lib.js";

export function internalAnalyticsInc(
  metric: string,
  labels?: Record<string, string> | null,
  amount?: number,
): void {
  ML.internal_analytics_inc(metric, labels, amount);
}

export function internalAnalyticsObserve(
  metric: string,
  labels?: Record<string, string> | null,
  amount?: number,
): void {
  ML.internal_analytics_observe(metric, labels, amount);
}
