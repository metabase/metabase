import {
  completionStatus,
  currentCompletions,
  selectedCompletionIndex,
  setSelectedCompletion,
} from "@codemirror/autocomplete";
import { type EditorState, type Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { tokenAtPos } from "../position";
import { STRING } from "../pratt";
import { getTemplateFieldKind } from "../templates";

import { isOnPlaceholder } from "./placeholders";

/**
 * True where the user is clearly picking from the list: after `[`, on a
 * function's placeholder or a template's blank, or while typing a quoted
 * value. Elsewhere, a plain word like "total" may be part of a request to
 * the AI, so Enter must not pick a suggestion for it.
 */
function isPicking(state: EditorState) {
  if (isOnPlaceholder(state) || getTemplateFieldKind(state) != null) {
    return true;
  }
  const token = tokenAtPos(state.doc.toString(), state.selection.main.head);
  return token != null && (token.text.startsWith("[") || token.type === STRING);
}

// The editors where the user moved the highlight with the keyboard, while
// the list is open.
const movedByUser = new WeakSet<EditorView>();

const MOVE_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp"]);

function needsSelection(view: EditorView, state: EditorState) {
  return (
    !movedByUser.has(view) &&
    currentCompletions(state).length > 0 &&
    selectedCompletionIndex(state) !== 0 &&
    isPicking(state)
  );
}

/**
 * The list opens with nothing highlighted (`selectOnOpen: false`): Down
 * highlights the first option. Where the user is picking, the first option
 * is highlighted at once, so Tab and Enter pick it.
 *
 * A slow source, like the on-device model, adds its options later, maybe
 * above the highlighted one. Then the first option stays highlighted, unless
 * the user moved the highlight.
 */
export const preselectWhenPicking: Extension = [
  /* #__PURE__ */ EditorView.updateListener.of((update) => {
    const { state, view } = update;
    if (completionStatus(state) == null) {
      movedByUser.delete(view);
      return;
    }
    if (!needsSelection(view, state)) {
      return;
    }
    // After the other update listeners. A dispatch here would reach the
    // listeners that come after this one before the current update, so the
    // list of options would show the current update, with no highlight.
    queueMicrotask(() => {
      if (needsSelection(view, view.state)) {
        view.dispatch({ effects: setSelectedCompletion(0) });
      }
    });
  }),
  /* #__PURE__ */ Prec.highest(
    /* #__PURE__ */ EditorView.domEventHandlers({
      keydown(event, view) {
        if (MOVE_KEYS.has(event.key) && completionStatus(view.state) != null) {
          movedByUser.add(view);
        }
        return false;
      },
    }),
  ),
];
