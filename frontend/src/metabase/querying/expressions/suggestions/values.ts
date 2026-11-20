import type { CompletionContext } from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { t } from "ttag";

import * as Lib from "metabase-lib";

import { getMBQLName } from "../clause";
import {
  CALL,
  COMMA,
  END_OF_INPUT,
  EQUALITY,
  FIELD,
  GROUP,
  GROUP_CLOSE,
  IDENTIFIER,
  STRING,
  type Token,
  lexify,
} from "../pratt";

import type { CompletionResult, ExpressionSuggestion } from "./types";

/** The values of a column that contain `search`, at most `limit` of them. */
export type GetColumnValues = (
  column: Lib.ColumnMetadata,
  search: string,
  limit: number,
) => Promise<string[]>;

export const MAX_COLUMN_VALUES = 20;

/** Functions that compare their first value, a column, to the other values. */
const VALUE_FUNCTIONS = new Set([
  "contains",
  "does-not-contain",
  "starts-with",
  "ends-with",
  "in",
  "not-in",
]);

type ValuePosition = {
  /** The column that the value is compared to. */
  columnName: string;
  /** The text that the value replaces. */
  from: number;
  to: number;
  /** The part of the value before the cursor. */
  search: string;
  quote: string;
  /** True when the user typed a word, not a text in quotes. */
  isWord: boolean;
};

/**
 * The value that the cursor is on, when the value is compared to a column, as
 * in `[Status] = "can"` or `contains([City], "San")`.
 */
function getValuePosition(source: string, pos: number): ValuePosition | null {
  const tokens = lexify(source).filter((token) => token.type !== END_OF_INPUT);
  const index = tokens.findIndex(
    (token) => token.start < pos && pos <= token.end,
  );
  const token = index >= 0 ? tokens[index] : null;

  if (token != null && token.type === STRING) {
    const quote = token.text[0];
    const isClosed = token.text.length > 1 && token.text.endsWith(quote);
    if (isClosed && pos === token.end) {
      return null;
    }
  } else if (token != null && token.type !== IDENTIFIER) {
    return null;
  }

  const before = token
    ? tokens.slice(0, index)
    : tokens.filter((token) => token.end <= pos);
  const prev = before.at(-1);
  // Only spaces between the previous token and an empty value.
  if (
    prev == null ||
    (token == null && source.slice(prev.end, pos).trim() !== "")
  ) {
    return null;
  }

  const columnName = getComparedColumnName(before);
  if (columnName == null) {
    return null;
  }

  if (token == null) {
    return {
      columnName,
      from: pos,
      to: pos,
      search: "",
      quote: '"',
      isWord: false,
    };
  }
  const isString = token.type === STRING;
  return {
    columnName,
    from: token.start,
    to: token.end,
    search: source.slice(token.start + (isString ? 1 : 0), pos),
    quote: isString ? token.text[0] : '"',
    isWord: !isString,
  };
}

/** The name of the column that the next value is compared to, or null. */
function getComparedColumnName(before: Token[]) {
  const prev = before.at(-1);
  const prevPrev = before.at(-2);
  if (prev?.type === EQUALITY && prevPrev?.type === FIELD) {
    return prevPrev.value ?? null;
  }
  if (prev?.type !== COMMA) {
    return null;
  }

  // Find the "(" of the function around the value.
  let depth = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    const token = before[i];
    if (token.type === GROUP_CLOSE) {
      depth++;
    } else if (token.type === GROUP) {
      if (depth > 0) {
        depth--;
        continue;
      }
      const call = before[i - 1];
      const first = before[i + 1];
      const name = call?.type === CALL ? getMBQLName(call.text.trim()) : null;
      return name != null && VALUE_FUNCTIONS.has(name) && first?.type === FIELD
        ? (first.value ?? null)
        : null;
    }
  }
  return null;
}

/** True when the cursor is in a text value that is compared to a column. */
export function isOnColumnValue(state: EditorState) {
  const position = getValuePosition(
    state.doc.toString(),
    state.selection.main.head,
  );
  return position != null && !position.isWord;
}

/** Text columns, not numbers, dates or true-or-false values. */
export function hasTextValues(column: Lib.ColumnMetadata) {
  return (
    !Lib.isNumeric(column) && !Lib.isTemporal(column) && !Lib.isBoolean(column)
  );
}

export function suggestColumnValues({
  query,
  stageIndex,
  availableColumns,
  getColumnValues,
}: {
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  getColumnValues?: GetColumnValues;
}) {
  if (getColumnValues == null) {
    return null;
  }
  const columns = availableColumns.map((column) => {
    const info = Lib.displayInfo(query, stageIndex, column);
    return {
      column,
      names: [info.longDisplayName, info.displayName].map((name) =>
        name.toLowerCase(),
      ),
      displayName: info.displayName,
    };
  });

  return async function (
    context: CompletionContext,
  ): Promise<CompletionResult | null> {
    const position = getValuePosition(
      context.state.doc.toString(),
      context.pos,
    );
    if (position == null) {
      return null;
    }
    const name = position.columnName.toLowerCase();
    const match = columns.find(({ names }) => names.includes(name));
    if (match == null || !hasTextValues(match.column)) {
      return null;
    }

    const values = await getColumnValues(
      match.column,
      position.search,
      MAX_COLUMN_VALUES,
    );
    if (values.length === 0) {
      return null;
    }

    const search = position.search.toLowerCase();
    const options = values.map((value, index): ExpressionSuggestion => {
      const start = search === "" ? -1 : value.toLowerCase().indexOf(search);
      return {
        type: "value",
        label: quoteValue(value, position.quote),
        displayLabel: value,
        icon: "string",
        matches: start >= 0 ? [[start, start + search.length - 1]] : [],
        heading: index === 0 ? t`Values of ${match.displayName}` : undefined,
      };
    });
    return {
      from: position.from,
      to: position.to,
      options,
      filter: false,
    };
  };
}

function quoteValue(value: string, quote: string) {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(new RegExp(quote, "g"), `\\${quote}`);
  return `${quote}${escaped}${quote}`;
}
