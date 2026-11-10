import { snippet } from "@codemirror/autocomplete";
import { type Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { getClauseDefinition, getMBQLName } from "./clause";
import { tokenAtPos } from "./position";
import { CALL, IDENTIFIER } from "./pratt";
import { expressionClauseSnippet } from "./suggestions";

/** Characters before which typing `(` still adds its argument placeholders. */
const ALLOWED_NEXT_CHARACTER = /^$|^[\s),\]]$/;

/**
 * Typing `(` right after a function name, as in `case(`, inserts the
 * function's argument placeholders, the same way choosing it from the
 * suggestions does: `case(condition, output)`.
 */
export function functionArgumentPlaceholders(): Extension {
  // Runs before the bracket auto-closing, which would otherwise add `()`.
  return Prec.highest(
    EditorView.inputHandler.of((view, from, to, text) => {
      if (
        text !== "(" ||
        from !== to ||
        view.state.selection.ranges.length > 1
      ) {
        return false;
      }

      const source = view.state.doc.toString();
      const token = tokenAtPos(source, from);
      const isFunctionName =
        token != null &&
        token.end === from &&
        (token.type === IDENTIFIER || token.type === CALL);
      const isFollowedBySpace = ALLOWED_NEXT_CHARACTER.test(
        source.charAt(from),
      );
      if (!isFunctionName || !isFollowedBySpace) {
        return false;
      }

      const name = getMBQLName(token.text);
      if (name == null) {
        return false;
      }

      snippet(expressionClauseSnippet(getClauseDefinition(name)))(
        view,
        null,
        token.start,
        from,
      );
      return true;
    }),
  );
}
