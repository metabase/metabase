import type { CompletionContext } from "@codemirror/autocomplete";

import * as Lib from "metabase-lib";

import { formatIdentifier } from "../identifier";
import { tokenAtPos } from "../position";

import { fuzzyMatcher } from "./util";

export type Options = {
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  availableMetrics?: Lib.MetricMetadata[];
};

export function suggestMetrics({
  expressionMode,
  query,
  stageIndex,
  availableMetrics,
}: Options) {
  const metrics = (
    availableMetrics ?? Lib.availableMetrics(query, stageIndex)
  )?.map((metric) => {
    const displayInfo = Lib.displayInfo(query, stageIndex, metric);
    return {
      type: "metric",
      displayLabel: displayInfo.longDisplayName,
      label: formatIdentifier(displayInfo.longDisplayName),
      icon: "metric" as const,
    };
  });

  if (expressionMode !== "aggregation" || metrics.length === 0) {
    return null;
  }

  const matcher = fuzzyMatcher(metrics);

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token) {
      return null;
    }

    const word = token.text.replace(/^\[/, "").replace(/\]$/, "");
    if (word === "") {
      return {
        from: token.start,
        to: token.end,
        options: metrics,
        filter: false,
      };
    }

    return {
      from: token.start,
      to: token.end,
      options: matcher(token.text),
    };
  };
}
