import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
  keymap,
} from "@codemirror/view";

import type { MetricDefinitionEntry } from "../../../types/viewer-state";
import { parseFullTextWithPositions } from "../utils";

import S from "./MetricSearchInput.module.css";

class MetricTokenWidget extends WidgetType {
  constructor(readonly name: string) {
    super();
  }

  eq(other: MetricTokenWidget) {
    return this.name === other.name;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = S.cmMetricToken;
    span.textContent = this.name;
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

export const setMetricEntries = StateEffect.define<MetricDefinitionEntry[]>();

const metricEntriesField = StateField.define<MetricDefinitionEntry[]>({
  create: () => [],
  update(entries, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMetricEntries)) {
        return effect.value;
      }
    }
    return entries;
  },
});

type MetricRange = { from: number; to: number; name: string };

function computeMetricTokenRanges(
  docText: string,
  docLength: number,
  metricEntries: MetricDefinitionEntry[],
): MetricRange[] {
  if (metricEntries.length === 0) {
    return [];
  }

  const tokens = parseFullTextWithPositions(docText, metricEntries);
  return tokens
    .filter(
      (t) =>
        t.type === "metric" &&
        t.from >= 0 &&
        t.to <= docLength &&
        t.from < t.to,
    )
    .sort((a, b) => a.from - b.from)
    .map((t) => ({
      from: t.from,
      to: t.to,
      name: docText.slice(t.from, t.to),
    }));
}

function rangesToDecorations(ranges: MetricRange[]): DecorationSet {
  if (ranges.length === 0) {
    return Decoration.none;
  }
  const decorations = ranges.map((r) =>
    Decoration.replace({
      widget: new MetricTokenWidget(r.name),
    }).range(r.from, r.to),
  );
  return Decoration.set(decorations);
}

/** Stores the raw metric ranges for lookup by keymap handlers. */
const metricTokenRangesField = StateField.define<MetricRange[]>({
  create: () => [],
  update(ranges, tr) {
    const entries = tr.state.field(metricEntriesField);
    const entriesChanged = tr.effects.some((e) => e.is(setMetricEntries));
    if (tr.docChanged || entriesChanged) {
      return computeMetricTokenRanges(
        tr.newDoc.toString(),
        tr.newDoc.length,
        entries,
      );
    }
    return ranges;
  },
});

/** Derives replace decorations from the metric ranges. */
const metricDecorationsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const entries = tr.state.field(metricEntriesField);
    const entriesChanged = tr.effects.some((e) => e.is(setMetricEntries));
    if (tr.docChanged || entriesChanged) {
      const ranges = computeMetricTokenRanges(
        tr.newDoc.toString(),
        tr.newDoc.length,
        entries,
      );
      return rangesToDecorations(ranges);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Find the metric range that the cursor is adjacent to or inside of.
 * For Backspace: find a range whose `to` equals cursor pos (cursor is right after it),
 *   or a range that contains the cursor.
 * For Delete: find a range whose `from` equals cursor pos (cursor is right before it),
 *   or a range that contains the cursor.
 */
function findAdjacentMetricRange(
  ranges: MetricRange[],
  pos: number,
  direction: "backward" | "forward",
): MetricRange | undefined {
  for (const range of ranges) {
    // Cursor is inside the range
    if (pos > range.from && pos < range.to) {
      return range;
    }
    // Backspace: cursor is right after the range
    if (direction === "backward" && pos === range.to) {
      return range;
    }
    // Delete: cursor is right before the range
    if (direction === "forward" && pos === range.from) {
      return range;
    }
  }
  return undefined;
}

const metricTokenKeymap = keymap.of([
  {
    key: "Backspace",
    run(view) {
      const { state } = view;
      const sel = state.selection.main;
      if (!sel.empty) {
        return false;
      }
      const ranges = state.field(metricTokenRangesField);
      const match = findAdjacentMetricRange(ranges, sel.head, "backward");
      if (!match) {
        return false;
      }
      view.dispatch({
        changes: { from: match.from, to: match.to },
      });
      return true;
    },
  },
  {
    key: "Delete",
    run(view) {
      const { state } = view;
      const sel = state.selection.main;
      if (!sel.empty) {
        return false;
      }
      const ranges = state.field(metricTokenRangesField);
      const match = findAdjacentMetricRange(ranges, sel.head, "forward");
      if (!match) {
        return false;
      }
      view.dispatch({
        changes: { from: match.from, to: match.to },
      });
      return true;
    },
  },
]);

export const metricTokenHighlight = [
  metricEntriesField,
  metricTokenRangesField,
  metricDecorationsField,
  EditorView.atomicRanges.of((view) =>
    view.state.field(metricDecorationsField),
  ),
  metricTokenKeymap,
];
