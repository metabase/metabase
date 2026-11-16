import {
  type Completion,
  acceptCompletion,
  closeCompletion,
  completionStatus,
  hasNextSnippetField,
  hasPrevSnippetField,
  nextSnippetField,
  pickedCompletion,
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

function isSnippetActive(state: EditorState) {
  return hasNextSnippetField(state) || hasPrevSnippetField(state);
}

/**
 * The value at `pos` is the last one of its call, and the call takes more:
 * another value of a function like concat(), or an optional one. Then
 * picking a value stays there, so that a comma can add the next one.
 */
function canTakeMoreValues(state: EditorState, pos: number) {
  const source = state.doc.toString();
  const fn = enclosingFunction(source, pos);
  if (fn?.arg == null) {
    return false;
  }
  const isLastValue = source.slice(fn.arg.to).trimStart().startsWith(")");
  return (
    isLastValue && getNextArgumentPlaceholder(fn.name, fn.arg.index + 1) != null
  );
}

/** Picks the highlighted option, or moves on when the list is closed. */
function pickOrMoveOn(view: EditorView) {
  // "No columns fit here" is a message, not an option: skip past it.
  if (selectedCompletion(view.state)?.type === "empty") {
    closeCompletion(view);
    return nextSnippetField(view);
  }
  if (completionStatus(view.state) === "active") {
    // CodeMirror ignores a pick right after the list changes. Don't move on
    // then, which would skip the value without picking it.
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

/**
 * One rule for the placeholders of functions and templates: Tab and Enter
 * pick the highlighted option and move to the next placeholder, or just move
 * on when the list is closed. Shift-Tab goes back. After the last value, they
 * go past the closing parenthesis, where the snippet ends.
 */
const tabAndEnterMoveOn = /* #__PURE__ */ Prec.highest(
  /* #__PURE__ */ EditorView.domEventHandlers({
    keydown(event, view) {
      const isMoveKey = event.key === "Enter" || event.key === "Tab";
      const hasModifier =
        event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;
      if (!isMoveKey || hasModifier || !isSnippetActive(view.state)) {
        return false;
      }
      event.preventDefault();
      return pickOrMoveOn(view);
    },
  }),
);

/**
 * Picking a column or a value on a placeholder moves to the next one, by
 * keyboard or by mouse. Picking a function starts its own placeholders, so
 * the cursor stays in them.
 */
const moveOnAfterPick = /* #__PURE__ */ EditorView.updateListener.of(
  (update) => {
    if (!isSnippetActive(update.state)) {
      return;
    }
    const pickedValue = update.transactions.some((transaction) => {
      const completion = transaction.annotation(pickedCompletion);
      return completion != null && typeof completion.apply !== "function";
    });
    const pos = update.state.selection.main.head;
    if (pickedValue && !canTakeMoreValues(update.state, pos)) {
      nextSnippetField(update.view);
    }
  },
);

/** How placeholders behave while typing: Tab, Enter, comma and picking. */
export function placeholderNavigation(): Extension {
  return [commaMovesOn, tabAndEnterMoveOn, moveOnAfterPick];
}
