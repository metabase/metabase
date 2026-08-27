import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

import { isMathExpressionOperator } from "metabase-types/api";

import S from "./MetricSearchInput.module.css";

const operatorMark = Decoration.mark({ class: S.cmOperator });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = view.state.doc.toString();
  for (let i = 0; i < text.length; i++) {
    if (isMathExpressionOperator(text[i])) {
      builder.add(i, i + 1, operatorMark);
    }
  }
  return builder.finish();
}

export const operatorHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
