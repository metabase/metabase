import type { ExpressionSubToken, MetricSourceId } from "../types/viewer-state";

/**
 * Stamps sequential occurrence counts on metric tokens so that duplicate
 * metrics within an expression can be disambiguated in the UI
 * (e.g. "Revenue / Revenue (2)").
 *
 * Call this once when finalising a token array — after parsing user input
 * or deserialising from the URL.
 */
export function stampMetricCounts(
  tokens: ExpressionSubToken[],
): ExpressionSubToken[] {
  const counts = new Map<MetricSourceId, number>();
  return tokens.map((token) => {
    if (token.type === "metric") {
      const count = (counts.get(token.sourceId) ?? 0) + 1;
      counts.set(token.sourceId, count);
      return { ...token, count };
    }
    return token;
  });
}
