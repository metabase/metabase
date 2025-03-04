import type { CompletionContext } from "@codemirror/autocomplete";

import * as Lib from "metabase-lib";

import { formatIdentifier } from "../identifier";

import { content, fuzzyMatcher, tokenAtPos } from "./util";

export type Options = {
  startRule: string;
  query: Lib.Query;
  stageIndex: number;
};

export function suggestMetrics({ startRule, query, stageIndex }: Options) {
  const metrics = Lib.availableMetrics(query, stageIndex)?.map(metric => {
    const displayInfo = Lib.displayInfo(query, stageIndex, metric);
    return {
      type: "metric",
      displayLabel: displayInfo.longDisplayName,
      label: formatIdentifier(displayInfo.longDisplayName),
      icon: "metric" as const,
    };
  });

  if (startRule !== "aggregation" || metrics.length === 0) {
    return null;
  }

  const matcher = fuzzyMatcher(metrics);

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token) {
      return null;
    }

    const text = content(source, token);
    const word = text.replace(/^\[/, "").replace(/\]$/, "");
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
      options: matcher(text),
    };
  };
}
