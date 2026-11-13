import type { CompletionContext } from "@codemirror/autocomplete";

import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";

import { formatIdentifier } from "../identifier";
import { tokenAtPos } from "../position";
import { getTemplateFieldKind } from "../templates";

import {
  type ExpectedColumnType,
  getExpectedColumnType,
} from "./argument-type";
import { isOnPlaceholder } from "./placeholders";
import type { CompletionResult, ExpressionSuggestion } from "./types";
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

  return function (context: CompletionContext): CompletionResult | null {
    const source = context.state.doc.toString();

    // Inside a function, only the columns of the type its value takes.
    const expectedType = getExpectedColumnType(source, context.pos);
    const fittingColumns = expectedType
      ? columns.filter((option) => expectedType.test(option.column))
      : columns;

    const templateFieldKind = getTemplateFieldKind(context.state);
    if (templateFieldKind === "text") {
      return null;
    }
    if (templateFieldKind === "column" || isOnPlaceholder(context.state)) {
      // A template's column or a function's placeholder isn't a search term:
      // offer every column that fits, to replace it.
      const { from, to } = context.state.selection.main;
      return {
        from,
        to,
        options: withEmptyState(
          fittingColumns.map((column) => ({ ...column, matches: undefined })),
          expectedType,
        ),
        filter: false,
      };
    }

    const token = tokenAtPos(source, context.pos);

    if (!token || (!columnsOutsideBrackets && !token.text.startsWith("["))) {
      return null;
    }

    // Only a "[" asks for a column, so only then say that none fits.
    const isColumnRequest = token.text.startsWith("[");
    const word = token.text.replace(/^\[/, "").replace(/\]$/, "");
    const options =
      word === "" ? fittingColumns : fuzzyMatcher(fittingColumns)(word);

    return {
      from: token.start,
      to: token.end,
      options: isColumnRequest
        ? withEmptyState(options, expectedType, word)
        : options,
      // The matcher filters and orders the options, with abbreviations and
      // typos that the filter of CodeMirror would drop.
      filter: false,
    };
  };
}

/**
 * When no column fits, a row that says so instead of an empty list, which
 * would close it. It can't be picked: choosing it inserts nothing.
 */
function withEmptyState(
  options: ExpressionSuggestion[],
  expectedType: ExpectedColumnType | null,
  word = "",
): ExpressionSuggestion[] {
  if (options.length > 0 || expectedType == null) {
    return options;
  }
  return [
    {
      type: "empty",
      label: "",
      displayLabel: expectedType.getEmptyMessage(word),
      icon: "info",
      apply: () => undefined,
    },
  ];
}
