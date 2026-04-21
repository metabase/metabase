import {
  type EditorState,
  MapMode,
  RangeSet,
  RangeValue,
  StateEffect,
  StateField,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
  keymap,
} from "@codemirror/view";

import type { MetricDefinition } from "metabase-lib/metric";

import type { MetricSourceId } from "../../../types/viewer-state";
import type { MetricIdentityEntry } from "../utils";

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

// ── Identity tracking ──────────────────────────────────────────────────────

class MetricIdentity extends RangeValue {
  override mapMode = MapMode.TrackDel;
  // Prevent the range from absorbing adjacent text insertions —
  // without this, typing right next to a metric would extend its range.
  override startSide = 1;
  override endSide = -1;

  constructor(
    readonly sourceId: MetricSourceId,
    readonly definition: MetricDefinition | null,
    readonly slotIndex: number | undefined,
  ) {
    super();
  }

  override eq(other: MetricIdentity) {
    return (
      this.sourceId === other.sourceId &&
      this.definition === other.definition &&
      this.slotIndex === other.slotIndex
    );
  }
}

export const setMetricIdentities =
  StateEffect.define<RangeSet<MetricIdentity>>();

export const addMetricIdentity = StateEffect.define<MetricIdentityEntry>();

export const metricIdentityField = StateField.define<RangeSet<MetricIdentity>>({
  create: () => RangeSet.empty,
  update(identities, tr) {
    // Full reset — replaces all identities. Any addMetricIdentity effects
    // in the same transaction are intentionally ignored.
    for (const effect of tr.effects) {
      if (effect.is(setMetricIdentities)) {
        return effect.value;
      }
    }

    let current = identities;
    if (tr.docChanged) {
      current = current.map(tr.changes);
    }

    for (const effect of tr.effects) {
      if (effect.is(addMetricIdentity)) {
        const { from, to, sourceId, definition, slotIndex } = effect.value;
        const newRange = new MetricIdentity(
          sourceId,
          definition,
          slotIndex,
        ).range(from, to);
        current = current.update({ add: [newRange] });
      }
    }

    return current;
  },
});

export function identitiesFromEntries(
  entries: MetricIdentityEntry[],
): RangeSet<MetricIdentity> {
  const ranges = entries.map((entry) =>
    new MetricIdentity(entry.sourceId, entry.definition, entry.slotIndex).range(
      entry.from,
      entry.to,
    ),
  );
  return RangeSet.of(ranges, true);
}

export function readMetricIdentities(view: EditorView): MetricIdentityEntry[] {
  const identities = view.state.field(metricIdentityField);
  const result: MetricIdentityEntry[] = [];
  const docLength = view.state.doc.length;
  identities.between(0, docLength, (from, to, value) => {
    result.push({
      sourceId: value.sourceId,
      from,
      to,
      definition: value.definition,
      slotIndex: value.slotIndex,
    });
  });
  return result;
}

// ── Token highlighting ─────────────────────────────────────────────────────

type MetricRange = { from: number; to: number; name: string };

function computeMetricTokenRanges(state: EditorState): MetricRange[] {
  const identities = state.field(metricIdentityField);
  const docLength = state.doc.length;
  const ranges: MetricRange[] = [];

  identities.between(0, docLength, (from, to) => {
    if (from < to) {
      ranges.push({ from, to, name: state.doc.sliceString(from, to) });
    }
  });

  return ranges;
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

function identitiesChanged(tr: Transaction): boolean {
  return (
    tr.docChanged ||
    tr.effects.some((e) => e.is(setMetricIdentities) || e.is(addMetricIdentity))
  );
}

const metricTokenRangesField = StateField.define<MetricRange[]>({
  create: () => [],
  update(ranges, tr) {
    if (!identitiesChanged(tr)) {
      return ranges;
    }
    return computeMetricTokenRanges(tr.state);
  },
});

const metricDecorationsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    if (!identitiesChanged(tr)) {
      return decorations;
    }
    return rangesToDecorations(tr.state.field(metricTokenRangesField));
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
  metricIdentityField,
  metricTokenRangesField,
  metricDecorationsField,
  EditorView.atomicRanges.of((view) =>
    view.state.field(metricDecorationsField),
  ),
  metricTokenKeymap,
];
