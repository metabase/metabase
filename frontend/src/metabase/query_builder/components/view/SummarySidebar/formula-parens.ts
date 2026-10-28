import { matchBrackets } from "@codemirror/language";
import { type EditorState, Prec, type StateCommand } from "@codemirror/state";
import { keymap } from "@codemirror/view";

const OPENING_PAREN = "(";

/** The range of the `)` that closes the `(` at `pos`, or `null` when there's no `(` there or it's unclosed. */
function getClosingParen(state: EditorState, pos: number) {
  if (state.sliceDoc(pos, pos + 1) !== OPENING_PAREN) {
    return null;
  }
  const match = matchBrackets(state, pos, 1, { brackets: "()" });
  return match?.matched && match.end != null ? match.end : null;
}

function deleteParenPair(direction: "backward" | "forward"): StateCommand {
  return ({ state, dispatch }) => {
    const { ranges, main } = state.selection;
    if (ranges.length > 1 || !main.empty) {
      return false;
    }
    const openingPos = direction === "backward" ? main.head - 1 : main.head;
    const closingParen = getClosingParen(state, openingPos);
    if (closingParen == null) {
      return false;
    }
    dispatch(
      state.update({
        changes: [{ from: openingPos, to: openingPos + 1 }, closingParen],
        selection: { anchor: openingPos },
        scrollIntoView: true,
        userEvent: `delete.${direction}`,
      }),
    );
    return true;
  };
}

/**
 * Deleting a `(` also deletes the `)` that closes it, wherever it is, keeping what's between
 * them, so a function's name and parentheses can be deleted without stranding a `)`.
 */
export const parenPairDeletion = /* #__PURE__ */ Prec.high(
  /* #__PURE__ */ keymap.of([
    { key: "Backspace", run: deleteParenPair("backward") },
    { key: "Delete", run: deleteParenPair("forward") },
  ]),
);
