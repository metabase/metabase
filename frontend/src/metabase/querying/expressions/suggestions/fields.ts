import type { CompletionContext } from "@codemirror/autocomplete";

import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";

import { formatIdentifier } from "../identifier";
import { tokenAtPos } from "../position";
import { getTemplateFieldKind } from "../templates";

import type { CompletionResult } from "./types";
import { fuzzyMatcher } from "./util";

export type Options = {
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  /** False: columns only after "[", not for a bare word. */
  columnsOutsideBrackets?: boolean;
};

export function suggestFields({
  query,
  stageIndex,
  availableColumns,
  columnsOutsideBrackets = true,
}: Options) {
  const columns = availableColumns.map((column) => {
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
    const templateFieldKind = getTemplateFieldKind(context.state);
    if (templateFieldKind === "text") {
      return null;
    }
    if (templateFieldKind === "column") {
      // A template's column is a placeholder, not a search term: offer every
      // column, to replace it.
      const { from, to } = context.state.selection.main;
      return {
        from,
        to,
        options: columns.map((column) => ({ ...column, matches: undefined })),
        filter: false,
      };
    }

    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token || (!columnsOutsideBrackets && !token.text.startsWith("["))) {
      return null;
    }

    const word = token.text.replace(/^\[/, "").replace(/\]$/, "");
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
      // The matcher filters and orders the options, with abbreviations and
      // typos that the filter of CodeMirror would drop.
      filter: false,
    };
  };
}
