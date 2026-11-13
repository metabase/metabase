import type {
  CompletionContext,
  CompletionSource,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { t } from "ttag";

import { isRequestText } from "../request-text";

import type { CompletionResult, ExpressionSuggestion } from "./types";

/** Sends the text in the editor to the AI as a request. */
export type TextRequestOption = {
  /** False when the editor is not for a new column, or is read-only. */
  isEnabled: () => boolean;
  run: () => void;
};

function isOnTextRequest(
  state: EditorState,
  textRequest: TextRequestOption | undefined,
) {
  return (
    textRequest != null &&
    textRequest.isEnabled() &&
    isRequestText(state.doc.toString())
  );
}

/**
 * When a new column has text that reads like a request, not like an
 * expression, the only suggestion is to generate the expression with AI.
 */
export function suggestTextRequest(textRequest: TextRequestOption | undefined) {
  if (textRequest == null) {
    return null;
  }
  return function (context: CompletionContext): CompletionResult | null {
    if (!isOnTextRequest(context.state, textRequest)) {
      return null;
    }
    const option: ExpressionSuggestion = {
      type: "ai",
      label: "",
      displayLabel: t`Generate with AI`,
      icon: "ai",
      hint: t`Enter`,
      apply: () => textRequest.run(),
    };
    return {
      from: context.pos,
      to: context.pos,
      filter: false,
      options: [option],
    };
  };
}

/** The other suggestions don't show while the text reads like a request. */
export function quietOnTextRequest(textRequest: TextRequestOption | undefined) {
  return function (source: CompletionSource | null): CompletionSource | null {
    if (source === null || textRequest == null) {
      return source;
    }
    return (context) =>
      isOnTextRequest(context.state, textRequest) ? null : source(context);
  };
}
