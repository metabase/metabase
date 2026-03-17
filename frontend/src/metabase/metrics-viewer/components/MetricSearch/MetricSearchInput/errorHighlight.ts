import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
} from "@codemirror/view";

import type { ErrorRange } from "../utils";

import S from "./MetricSearchInput.module.css";

const errorMark = Decoration.mark({ class: S.cmErrorUnderline });

export const setErrorDecoration = StateEffect.define<ErrorRange[]>();

/** Stores error ranges with messages for tooltip lookup. */
const errorRangesField = StateField.define<ErrorRange[]>({
  create: () => [],
  update(ranges, tr) {
    if (tr.docChanged) {
      return [];
    }
    for (const effect of tr.effects) {
      if (effect.is(setErrorDecoration)) {
        return effect.value;
      }
    }
    return ranges;
  },
});

/** Builds mark decorations from stored error ranges. */
const errorDecorationField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    if (tr.docChanged) {
      return Decoration.none;
    }
    for (const effect of tr.effects) {
      if (effect.is(setErrorDecoration)) {
        if (effect.value.length === 0) {
          return Decoration.none;
        }
        const docLen = tr.newDoc.length;
        // Ranges must be sorted and non-overlapping for Decoration.set
        const marks = [...effect.value]
          .filter((r) => r.from < r.to && r.from >= 0 && r.to <= docLen)
          .sort((a, b) => a.from - b.from)
          .map((r) => errorMark.range(r.from, r.to));
        return marks.length > 0 ? Decoration.set(marks) : Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Shows the error message in a tooltip when hovering over an underlined range. */
const errorHoverTooltip = hoverTooltip((view, pos) => {
  const ranges = view.state.field(errorRangesField);
  const match = ranges.find((r) => r.from <= pos && pos < r.to);
  if (!match) {
    return null;
  }
  return {
    pos: match.from,
    end: match.to,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = S.cmErrorTooltip;
      dom.textContent = match.message;
      return { dom };
    },
  };
});

export const errorHighlight = [
  errorRangesField,
  errorDecorationField,
  errorHoverTooltip,
];
