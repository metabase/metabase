import { type Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { type RefObject, useEffect } from "react";

import S from "./CodeMirror.module.css";
import type { CodeMirrorRef } from "./types";

export type HighlightRange =
  | {
      start: number;
      end: number;
    }
  | {
      line: number;
    };

const highlightRangeEffect = StateEffect.define<Range<Decoration>[]>();
const highlightRangeDecoration = Decoration.mark({
  class: S.highlight,
  attributes: {
    "data-testid": "highlighted-text",
  },
});

export function highlightRanges() {
  return StateField.define({
    create() {
      return Decoration.none;
    },
    update(value, transaction) {
      value = value.map(transaction.changes);

      for (const effect of transaction.effects) {
        if (effect.is(highlightRangeEffect)) {
          value = value.update({ filter: () => false });
          value = value.update({ add: effect.value });
        }
      }

      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

function asRange(range: HighlightRange, view: EditorView): Range<Decoration> {
  if ("line" in range) {
    const line = view.state.doc.line(range.line);
    return highlightRangeDecoration.range(line.from, line.to);
  }
  return highlightRangeDecoration.range(range.start, range.end);
}

export function useHighlightRanges(
  editorRef: RefObject<CodeMirrorRef>,
  highlightedRanges?: HighlightRange[],
) {
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }

    const ranges =
      highlightedRanges?.map((range) => asRange(range, view)) ?? [];
    view.dispatch({ effects: highlightRangeEffect.of(ranges) });
  }, [editorRef, highlightedRanges]);
}
