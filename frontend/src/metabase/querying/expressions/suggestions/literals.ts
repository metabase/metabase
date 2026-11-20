import type { CompletionContext } from "@codemirror/autocomplete";

import { tokenAtPos } from "../position";
import { STRING } from "../pratt";

import { getAllowedValues } from "./argument-type";
import { isOnPlaceholder } from "./placeholders";
import type { CompletionResult, ExpressionSuggestion } from "./types";
import { isFieldReference, isIdentifier } from "./util";

export function suggestLiterals() {
  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token || !isIdentifier(token) || isFieldReference(token)) {
      // Cursor is inside a field reference tag
      return null;
    }

    return {
      from: token.start,
      to: token.end,
      options: [
        {
          label: "True",
          type: "literal",
          icon: "io",
        },
        {
          label: "False",
          type: "literal",
          icon: "io",
        },
      ],
    };
  };
}

/**
 * The text values that a function takes at the cursor, like the units of
 * datetimeDiff() ("day", "month"…) or the modes of week(), on a placeholder
 * or while typing one.
 */
export function suggestAllowedValues() {
  return function (context: CompletionContext): CompletionResult | null {
    const source = context.state.doc.toString();
    const allowed = getAllowedValues(source, context.pos);
    if (allowed == null) {
      return null;
    }

    const options: ExpressionSuggestion[] = allowed.values.map((value) => ({
      type: "literal",
      label: `"${value}"`,
      displayLabel: `"${value}"`,
      icon: "string",
    }));

    // A placeholder isn't a search term: offer every value, to replace it.
    if (isOnPlaceholder(context.state)) {
      const { from, to } = context.state.selection.main;
      return { from, to, options, filter: false };
    }

    const token = tokenAtPos(source, context.pos);
    const isTypingValue =
      token != null && (token.type === STRING || isIdentifier(token));
    if (isTypingValue) {
      return { from: token.start, to: token.end, options };
    }
    return context.explicit
      ? { from: context.pos, to: context.pos, options }
      : null;
  };
}
