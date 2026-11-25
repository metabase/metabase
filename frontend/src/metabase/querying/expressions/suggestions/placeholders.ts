import {
  type Completion,
  acceptCompletion,
  clearSnippet,
  closeCompletion,
  completionStatus,
  hasNextSnippetField,
  hasPrevSnippetField,
  nextSnippetField,
  selectedCompletion,
  snippet,
  startCompletion,
} from "@codemirror/autocomplete";
import { isolateHistory } from "@codemirror/commands";
import {
  type EditorState,
  type Extension,
  Prec,
  type Range,
  StateEffect,
  StateField,
  type Transaction,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import { getNextArgumentPlaceholder } from "../argument-names";
import { enclosingFunction } from "../position";

const addPlaceholders =
  /* #__PURE__ */ StateEffect.define<Range<Decoration>[]>();

const placeholderMark = /* #__PURE__ */ Decoration.mark({
  class: "cm-placeholderField",
});

/**
 * Marks the argument names that a function snippet inserts, until the user
 * types into them. CodeMirror keeps its own snippet field marks on the text
 * that the user types, thus they cannot tell an empty argument.
 */
export const placeholders = /* #__PURE__ */ StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let marks = value.map(tr.changes);
    if (tr.docChanged) {
      tr.changes.iterChangedRanges((_fromA, _toA, from, to) => {
        marks = marks.update({
          filter: (markFrom, markTo) => markTo < from || markFrom > to,
          filterFrom: from,
          filterTo: to,
        });
      });
    }
    for (const effect of tr.effects) {
      if (effect.is(addPlaceholders)) {
        marks = marks.update({
          add: effect.value,
          sort: true,
        });
      }
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Applies a snippet completion and marks its fields as placeholders. */
export function withPlaceholders<T extends Completion>(
  completion: T,
  template: string,
): T {
  const apply = completion.apply;
  if (typeof apply !== "function") {
    return completion;
  }
  return {
    ...completion,
    apply(view, completion, from, to) {
      apply(view, completion, from, to);
      markPlaceholders(view, template, from);
    },
  };
}

/**
 * Inserts a snippet such as `length(${value})` between `from` and `to`, and
 * marks its fields as placeholders, like a function picked from autocomplete.
 */
export function insertWithPlaceholders(
  view: EditorView,
  template: string,
  from: number,
  to: number,
) {
  // Its own undo step, so that undo doesn't also remove the name typed
  // before it.
  const dispatch = (transaction: Transaction) =>
    view.dispatch({
      changes: transaction.changes,
      selection: transaction.selection,
      effects: transaction.effects,
      scrollIntoView: true,
      annotations: isolateHistory.of("before"),
    });
  snippet(template)({ state: view.state, dispatch }, null, from, to);
  markPlaceholders(view, template, from);
}

function markPlaceholders(view: EditorView, template: string, from: number) {
  const ranges: Range<Decoration>[] = [];
  let offset = from;
  for (const [, text, name] of template.matchAll(
    /([^$]*)(?:\$\{([^}]*)\})?/g,
  )) {
    offset += text.length;
    if (name) {
      ranges.push(placeholderMark.range(offset, offset + name.length));
      offset += name.length;
    }
  }
  view.dispatch({
    effects: addPlaceholders.of(ranges),
  });
}

/** True when the selection is a placeholder that nothing was typed into yet. */
export function isOnPlaceholder(state: EditorState) {
  const { from, to } = state.selection.main;
  if (from === to) {
    return false;
  }
  let isPlaceholder = false;
  state.field(placeholders, false)?.between(from, to, (markFrom, markTo) => {
    if (markFrom === from && markTo === to) {
      isPlaceholder = true;
      return false;
    }
  });
  return isPlaceholder;
}

/**
 * Opens the suggestions when a placeholder is selected: after inserting a
 * function, and on moving to its next placeholder with Tab. The column
 * source offers the columns that fit there.
 */
export const openOnPlaceholders = /* #__PURE__ */ EditorView.updateListener.of(
  (update) => {
    // The marks change when a function's placeholders are added; the
    // selection when Tab moves to the next one. Restarting the suggestions
    // replaces the columns of the previous placeholder.
    const hasMarksChanged =
      update.startState.field(placeholders, false) !==
      update.state.field(placeholders, false);
    if (
      (update.selectionSet || hasMarksChanged) &&
      isOnPlaceholder(update.state)
    ) {
      startCompletion(update.view);
    }
  },
);

/** True while a function's placeholders or a template's blanks are filled in. */
export function isSnippetActive(state: EditorState) {
  return hasNextSnippetField(state) || hasPrevSnippetField(state);
}

/**
 * True when Enter belongs to the code: it picks the highlighted suggestion,
 * or moves to the next placeholder. Anything else may use Enter, like saving.
 */
export function isEnterForTheEditor(state: EditorState) {
  return selectedCompletion(state) != null || isSnippetActive(state);
}

/**
 * What Escape does in the code, one step at a time: close the suggestions,
 * then leave the placeholders. False when there was nothing to close, so
 * that Escape can do something else, like closing a popover.
 */
export function dismissSuggestionsOrPlaceholders(view: EditorView) {
  if (completionStatus(view.state) != null) {
    closeCompletion(view);
    return true;
  }
  if (isSnippetActive(view.state)) {
    return clearSnippet(view);
  }
  return false;
}

/**
 * Picks the highlighted option and stays on the placeholder, so that the user
 * can continue it, as in `[Status] = "pending"`. Moves on only when nothing is
 * highlighted, like snippets in VS Code.
 */
function pickOrMoveOn(view: EditorView) {
  // "No columns fit here" is a message, not an option: skip past it.
  if (selectedCompletion(view.state)?.type === "empty") {
    closeCompletion(view);
    return nextSnippetField(view);
  }
  if (selectedCompletion(view.state) != null) {
    acceptCompletion(view);
    return true;
  }
  return nextSnippetField(view);
}

/**
 * Moves on comma: inside a function's placeholders, a comma keeps what was
 * typed and goes to the next value. At the end of the last value, it adds a
 * placeholder for one more, when the function takes more: `concat(a, b|)`
 * becomes `concat(a, b, value3)`.
 */
const commaMovesOn = /* #__PURE__ */ Prec.highest(
  /* #__PURE__ */ EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== "," || view.state.selection.ranges.length > 1) {
      return false;
    }
    const source = view.state.doc.toString();
    const fn = enclosingFunction(source, from);
    if (fn?.arg == null || to !== fn.arg.to) {
      return false;
    }

    const rest = source.slice(fn.arg.to);
    const next = rest.trimStart().charAt(0);
    if (next === ",") {
      return isSnippetActive(view.state) && nextSnippetField(view);
    }
    if (next !== ")") {
      return false;
    }

    const placeholder = getNextArgumentPlaceholder(fn.name, fn.arg.index + 1);
    if (placeholder == null) {
      return false;
    }
    const closeParen = fn.arg.to + rest.indexOf(")");
    insertWithPlaceholders(
      view,
      `, \${${placeholder}})\${}`,
      fn.arg.to,
      closeParen + 1,
    );
    return true;
  }),
);

const CLOSING_BRACKETS: Record<string, string> = {
  "[": "]",
  "(": ")",
  '"': '"',
  "'": "'",
};

/**
 * A bracket or a quote typed on a placeholder replaces it. Bracket closing
 * would wrap the selected name instead, as in `[condition]`, and the name
 * would then limit the suggestions.
 */
const bracketReplacesPlaceholder = /* #__PURE__ */ Prec.highest(
  /* #__PURE__ */ EditorView.inputHandler.of((view, from, to, text) => {
    const closing = CLOSING_BRACKETS[text];
    if (
      closing == null ||
      view.state.selection.ranges.length > 1 ||
      !isOnPlaceholder(view.state)
    ) {
      return false;
    }
    view.dispatch({
      changes: { from, to, insert: text + closing },
      selection: { anchor: from + text.length },
      userEvent: "input.type",
    });
    return true;
  }),
);

/**
 * One rule for the placeholders of functions and templates: Tab and Enter
 * pick the highlighted option, or move to the next placeholder when the list
 * is closed. Shift-Tab goes back. After the last value, they
 * go past the closing parenthesis, where the snippet ends.
 */
const tabAndEnterMoveOn = /* #__PURE__ */ Prec.highest(
  /* #__PURE__ */ EditorView.domEventHandlers({
    keydown(event, view) {
      const isMoveKey = event.key === "Enter" || event.key === "Tab";
      const hasModifier =
        event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;
      // Enter also confirms the characters of an input method (Japanese,
      // Chinese, Korean…) while they're composed.
      const isComposing = event.isComposing || view.composing;
      if (!isMoveKey || hasModifier || isComposing) {
        return false;
      }
      if (!isSnippetActive(view.state)) {
        return false;
      }
      event.preventDefault();
      return pickOrMoveOn(view);
    },
  }),
);

/** How placeholders behave while typing: Tab, Enter and comma. */
export function placeholderNavigation(): Extension {
  return [commaMovesOn, bracketReplacesPlaceholder, tabAndEnterMoveOn];
}
