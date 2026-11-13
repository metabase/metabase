import {
  type CompletionContext,
  completionStatus,
  startCompletion,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { t } from "ttag";

import { getSupportedClauses } from "../clause";

import type { SuggestOptions } from "./suggest";
import type { CompletionResult } from "./types";
import { expressionClauseCompletion } from "./util";

/** The popular functions, while the expression is empty. */
export function suggestPopular({
  expressionMode,
  database,
  popularFunctions = [],
}: SuggestOptions) {
  const clauses = new Map(
    getSupportedClauses({ expressionMode, database }).map((clause) => [
      clause.displayName,
      clause,
    ]),
  );
  const type = expressionMode === "aggregation" ? "aggregation" : "function";
  const options = popularFunctions.flatMap((name) => {
    const clause = clauses.get(name);
    return clause ? [expressionClauseCompletion(clause, { type })] : [];
  });
  if (options.length === 0) {
    return null;
  }
  options[0] = { ...options[0], heading: t`Popular` };

  return function (context: CompletionContext): CompletionResult | null {
    if (context.state.doc.toString().trim() !== "") {
      return null;
    }
    return { from: context.pos, to: context.pos, options, filter: false };
  };
}

/**
 * Opens the autocomplete when the editor has focus and the expression is
 * empty, so that the popular functions show without typing, also when the
 * editor just opened. The editor may get focus before this is set up: while
 * it's read-only, as it formats the expression it opened with, or before the
 * database loads, which these suggestions need. So it also opens when either
 * of those ends.
 */
export function openWhenEmpty() {
  return EditorView.updateListener.of((update) => {
    const { view, state } = update;
    const canOpen = (state: EditorState) =>
      view.hasFocus &&
      state.doc.toString().trim() === "" &&
      completionStatus(state) == null;
    if (
      (update.docChanged ||
        update.focusChanged ||
        update.startState.readOnly !== update.state.readOnly ||
        update.transactions.some((transaction) => transaction.reconfigured)) &&
      canOpen(state)
    ) {
      // A view cannot dispatch while it applies an update. The text can
      // change before then, for example when an AI text goes in.
      setTimeout(() => {
        if (canOpen(view.state)) {
          startCompletion(view);
        }
      });
    }
  });
}
