import type { CompletionContext } from "@codemirror/autocomplete";

import * as Lib from "metabase-lib";

import { formatIdentifier } from "../identifier";

import { content, fuzzyMatcher, tokenAtPos } from "./util";

export type Options = {
  query: Lib.Query;
  stageIndex: number;
};

export function suggestSegments({ query, stageIndex }: Options) {
  const segments = Lib.availableSegments(query, stageIndex)?.map((segment) => {
    const displayInfo = Lib.displayInfo(query, stageIndex, segment);
    return {
      type: "segment",
      displayLabel: displayInfo.longDisplayName,
      label: formatIdentifier(displayInfo.longDisplayName),
      icon: "segment" as const,
    };
  });

  if (!segments) {
    return null;
  }

  const matcher = fuzzyMatcher(segments);

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
        options: segments,
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
