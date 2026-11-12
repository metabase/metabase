import {
  type CompletionContext,
  completionStatus,
  startCompletion,
} from "@codemirror/autocomplete";
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
 * empty, so that the popular functions show without typing.
 */
export function openWhenEmpty() {
  return EditorView.updateListener.of((update) => {
    const { view, state } = update;
    if (
      (update.docChanged || update.focusChanged) &&
      view.hasFocus &&
      state.doc.toString().trim() === "" &&
      completionStatus(state) == null
    ) {
      // A view cannot dispatch while it applies an update.
      setTimeout(() => startCompletion(view));
    }
  });
}
