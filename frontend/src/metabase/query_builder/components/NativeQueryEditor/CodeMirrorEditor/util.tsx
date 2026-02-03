import type { EditorState, SelectionRange } from "@codemirror/state";
import { createSelector } from "@reduxjs/toolkit";
import { shallowEqual } from "react-redux";
import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import { getEngineNativeType } from "metabase/lib/engine";
import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import type { CardId, CardType } from "metabase-types/api";

import type { Location, SelectionRange as Range } from "../types";

export function convertIndexToPosition(value: string, index: number): Location {
  let row = 0;
  let column = 0;

  for (let idx = 0; idx < index; idx++) {
    const ch = value[idx];
    if (ch === "\n") {
      row += 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return {
    row,
    column,
  };
}

export function convertSelectionToRange(
  value: string,
  selection: SelectionRange,
): Range {
  return {
    start: convertIndexToPosition(value, selection.from),
    end: convertIndexToPosition(value, selection.to),
  };
}

export const getCardAutocompleteResultMeta = (
  type: CardType,
  collectionName: string = t`Our analytics`,
) => {
  const collection = collectionName ?? t`Our analytics`;
  if (type === "question") {
    return t`Question in ${collection}`;
  }

  if (type === "model") {
    return t`Model in ${collection}`;
  }

  if (type === "metric") {
    return t`Metric in ${collection}`;
  }

  throw new Error(`Unknown question.type(): ${type}`);
};

export type TagMatch = {
  type: "variable" | "snippet" | "card";
  hasClosingTag: boolean;
  tag: {
    from: number;
    to: number;
    text: string;
  };
  content: {
    from: number;
    to: number;
    text: string;
  };
};

export type MatchTagOptions = {
  // If set consider this position as the cursor position.
  // If not set, the cursor position is the current position of the cursor in the editor.
  position?: number;

  // If true, return the tag even it it does not have a closing tag.
  // In this case we assume the tag is still being authored and it runs until the end of the line.
  allowOpenEnded?: boolean;
};

// Looks for the tag that the cursor is inside of, or null if the cursor is not inside a tag.
// Tags are delimited by {{ and }}.
// This also returns a Match if the tag is opened, but not closed at the end of the line.
export function matchTagAtCursor(
  state: EditorState,
  options: MatchTagOptions = {},
): TagMatch | null {
  const { position, allowOpenEnded } = options;

  if (
    position === undefined &&
    state.selection.main.from !== state.selection.main.to
  ) {
    return null;
  }

  const doc = state.doc.toString();
  const cursor = position ?? state.selection.main.from;

  let start = null;

  // look for the opening tag to the left of the cursor
  for (let idx = cursor; idx >= 0; idx--) {
    const currChar = doc[idx];
    const prevChar = doc[idx - 1];

    if (currChar === "\n") {
      // no tag opening found on this line
      return null;
    }

    if (currChar === "}" && prevChar === "}") {
      // closing bracket found before opening bracket
      // this means we are not in a tag
      return null;
    }

    if (currChar === "{" && prevChar === "{") {
      // we found the opening tag, exit the loop
      start = idx - 1;
      break;
    }
  }

  let end = allowOpenEnded ? doc.length : null;

  // look for the closing tag to the right of the cursor
  for (let idx = cursor; idx < doc.length; idx++) {
    const currChar = doc[idx];
    const nextChar = doc[idx + 1];

    if (currChar === "\n") {
      if (allowOpenEnded) {
        // we ran into the end of the line
        // but we allow open ended tags, so the tag implicitly closes here
        end = idx;
        break;
      }

      // we ran into the end of the line without a closing tag
      // the tag is malformed
      return null;
    }

    if (currChar === "}" && nextChar === "}") {
      // we found the closing tag, exit the loop
      end = idx + 2;
      break;
    }
  }

  if (start == null || end == null) {
    return null;
  }

  const text = doc.slice(start, end);
  const prefix = text.match(/^\{\{\s*/)?.[0];
  const suffix = text.match(/\s*(\}\})?$/)?.[0];
  if (prefix === undefined || suffix === undefined) {
    return null;
  }

  const content = doc.slice(start + prefix.length, end - suffix.length);

  const tag = {
    text,
    from: start,
    to: end,
  };
  const hasClosingTag = tag.text.endsWith("}}");

  if (content.startsWith("#")) {
    return {
      type: "card",
      hasClosingTag,
      tag,
      content: {
        text: content.slice(1),
        from: start + prefix.length + 1,
        to: end - suffix.length,
      },
    };
  }

  if (content.toLowerCase().startsWith("snippet:")) {
    const snippet = content.match(/^snippet:\s*/)?.[0];
    if (!snippet) {
      return null;
    }
    return {
      type: "snippet",
      hasClosingTag,
      tag,
      content: {
        text: content.slice(snippet.length),
        from: start + prefix.length + snippet.length,
        to: end - suffix.length,
      },
    };
  }

  return {
    type: "variable",
    hasClosingTag,
    tag,
    content: {
      text: content,
      from: start + prefix.length,
      to: end - suffix.length,
    },
  };
}

export function matchCardIdAtCursor(
  state: EditorState,
  options: MatchTagOptions = {},
): CardId | null {
  const tag = matchTagAtCursor(state, options);
  if (!tag || tag.type !== "card") {
    return null;
  }

  const id = tag.content.text.match(/^(\d+)/)?.[1];
  if (!id) {
    return null;
  }
  const parsedId = parseInt(id, 10);
  if (!Number.isInteger(parsedId)) {
    return null;
  }
  return parsedId;
}

export const getReferencedCardIds = createSelector(
  (query: Lib.Query) => Lib.templateTags(query),
  (tags) =>
    Object.values(tags)
      .filter((tag) => tag.type === "card")
      .map((tag) => tag["card-id"])
      .filter(isNotNull),
  {
    argsMemoizeOptions: { resultEqualityCheck: shallowEqual },
    memoizeOptions: {
      resultEqualityCheck: shallowEqual,
    },
  },
);

export const getPlaceholderText = (
  engine?: string | null,
  llmEnabled?: boolean,
): string => {
  if (!engine) {
    return "";
  }

  const SQLPlaceholder = "SELECT * FROM TABLE_NAME";
  const MongoPlaceholder = `[ { "$project": { "_id": "$_id" } } ]`;

  const engineType = getEngineNativeType(engine);

  if (llmEnabled && engineType === "sql") {
    return t`Write your SQL here, or press ${METAKEY} + Shift + i to have SQL generated for you.`;
  }

  switch (true) {
    case engineType === "sql":
      return SQLPlaceholder;
    case engine === "mongo":
      return MongoPlaceholder;
    default:
      return "";
  }
};

export function getSelectedRanges(state: EditorState): Range[] {
  const value = state.doc.toString();
  return state.selection.ranges.map((range) =>
    convertSelectionToRange(value, range),
  );
}
