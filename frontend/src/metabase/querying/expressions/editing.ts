import { insertBracket } from "@codemirror/autocomplete";
import { EditorSelection, type Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { tokenAtPos } from "./position";
import {
  CALL,
  FIELD,
  GROUP,
  GROUP_CLOSE,
  IDENTIFIER,
  STRING,
  lexify,
} from "./pratt";

const CLOSING_CHARACTERS = new Set([")", "]", '"']);

/** Opening and closing quotes that word processors and chat apps type. */
const CURLY_DOUBLE_QUOTES = /[“”„‟]/g;
const CURLY_SINGLE_QUOTED = /‘([^‘’]*)’/g;

/** Tokens that a double-click selects whole. */
const WHOLE_TOKENS = new Set([FIELD, STRING, IDENTIFIER, CALL]);

function moveCursor(view: EditorView, pos: number) {
  view.dispatch({
    selection: EditorSelection.cursor(pos),
    scrollIntoView: true,
  });
}

/** More `(` than `)`, outside text values and column names. */
function isMissingCloseParen(source: string) {
  const tokens = lexify(source);
  const opened = tokens.filter((token) => token.type === GROUP).length;
  const closed = tokens.filter((token) => token.type === GROUP_CLOSE).length;
  return opened > closed;
}

/**
 * Typing a closing `)`, `]` or `"` right before the same character moves past
 * it, instead of adding a second one, like `length([Total]))`. A bracket is
 * still added when one is missing, and a quote only skips the closing quote
 * of a text value.
 */
const typeOverClosing = /* #__PURE__ */ EditorView.inputHandler.of(
  (view, from, to, text) => {
    const { state } = view;
    if (
      !CLOSING_CHARACTERS.has(text) ||
      from !== to ||
      state.selection.ranges.length > 1 ||
      state.sliceDoc(from, from + 1) !== text
    ) {
      return false;
    }

    const source = state.doc.toString();
    if (text === ")" && isMissingCloseParen(source)) {
      return false;
    }
    if (text === "]" || text === '"') {
      // Only the end of the column name or text value being typed.
      const token = tokenAtPos(source, from + 1);
      const isClosing =
        token?.type === (text === "]" ? FIELD : STRING) &&
        token.end === from + 1 &&
        token.start < from &&
        source.charAt(token.start) === (text === "]" ? "[" : '"');
      if (!isClosing) {
        return false;
      }
    }

    moveCursor(view, from + 1);
    return true;
  },
);

/**
 * Curly quotes, as typed in docs, chats and spreadsheets, become the straight
 * quotes of text values. A lone `’` stays, since it's usually an apostrophe.
 */
export function straightenQuotes(text: string) {
  return text
    .replace(CURLY_SINGLE_QUOTED, '"$1"')
    .replace(CURLY_DOUBLE_QUOTES, '"');
}

const straightenTypedQuotes = /* #__PURE__ */ EditorView.inputHandler.of(
  (view, from, to, text) => {
    if (text !== "“" && text !== "”" && text !== "‘") {
      return false;
    }
    // Like typing a straight quote, which may add its closing quote too.
    const transaction =
      insertBracket(view.state, '"') ??
      view.state.update(view.state.replaceSelection('"'), {
        userEvent: "input.type",
      });
    view.dispatch(transaction);
    return true;
  },
);

const straightenPastedQuotes =
  /* #__PURE__ */ EditorView.clipboardInputFilter.of((text) =>
    straightenQuotes(text),
  );

/**
 * A double-click selects a whole column, text value or function name, like
 * `[Product → Title]`, instead of one word of it.
 */
const selectWholeTokenOnDoubleClick =
  /* #__PURE__ */ EditorView.domEventHandlers({
    mousedown(event, view) {
      const isPlainDoubleClick =
        event.detail === 2 &&
        event.button === 0 &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey;
      if (!isPlainDoubleClick) {
        return false;
      }
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) {
        return false;
      }
      const token = tokenAtPos(view.state.doc.toString(), pos);
      if (token == null || !WHOLE_TOKENS.has(token.type)) {
        return false;
      }
      event.preventDefault();
      view.dispatch({
        selection: EditorSelection.range(token.start, token.end),
        userEvent: "select.pointer",
      });
      return true;
    },
  });

/** Small typing comforts of the expression editor. */
export function expressionEditing(): Extension {
  return [
    // Before the bracket auto-closing, which handles the same characters.
    Prec.highest([typeOverClosing, straightenTypedQuotes]),
    straightenPastedQuotes,
    Prec.high(selectWholeTokenOnDoubleClick),
  ];
}
