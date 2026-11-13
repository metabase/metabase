import {
  type Completion,
  snippet,
  startCompletion,
} from "@codemirror/autocomplete";
import {
  type EditorState,
  type Range,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

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
  snippet(template)(view, null, from, to);
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
