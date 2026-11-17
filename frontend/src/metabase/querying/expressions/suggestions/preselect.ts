import {
  completionStatus,
  selectedCompletion,
  setSelectedCompletion,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
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

/**
 * The list opens with nothing highlighted (`selectOnOpen: false`): Down
 * highlights the first option. Where the user is picking, the first option
 * is highlighted at once, so Tab and Enter pick it.
 */
export const preselectWhenPicking =
  /* #__PURE__ */ EditorView.updateListener.of((update) => {
    const { state, view } = update;
    const needsSelection =
      completionStatus(state) === "active" &&
      selectedCompletion(state) == null &&
      isPicking(state);
    if (needsSelection) {
      view.dispatch({ effects: setSelectedCompletion(0) });
    }
  });
