import type { Completion } from "@codemirror/autocomplete";
import { type Range, StateEffect, StateField } from "@codemirror/state";
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
    },
  };
}
