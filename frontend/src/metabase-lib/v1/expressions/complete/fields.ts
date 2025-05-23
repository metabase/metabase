import type { CompletionContext } from "@codemirror/autocomplete";

// eslint-disable-next-line no-restricted-imports
import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";

import { formatIdentifier } from "../identifier";

import type { CompletionResult } from "./types";
import { content, fuzzyMatcher, tokenAtPos } from "./util";

export type Options = {
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number;
};

export function suggestFields({ query, stageIndex, expressionIndex }: Options) {
  const columns = Lib.expressionableColumns(
    query,
    stageIndex,
    expressionIndex,
  )?.map((column) => {
    const displayInfo = Lib.displayInfo(query, stageIndex, column);
    return {
      type: "field",
      label: formatIdentifier(displayInfo.longDisplayName),
      displayLabel: displayInfo.longDisplayName,
      icon: getColumnIcon(column),
      column,
    };
  });

  if (!columns || columns.length === 0) {
    return null;
  }

  const matcher = fuzzyMatcher(columns);

  return function (context: CompletionContext): CompletionResult | null {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token) {
      return null;
    }

    const word = content(source, token).replace(/^\[/, "").replace(/\]$/, "");
    if (word === "") {
      return {
        from: token.start,
        to: token.end,
        options: columns,
        filter: false,
      };
    }

    const options = matcher(word);

    return {
      from: token.start,
      to: token.end,
      options,
    };
  };
}
