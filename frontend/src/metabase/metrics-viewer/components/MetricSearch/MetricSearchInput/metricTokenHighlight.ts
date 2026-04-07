import {
  MapMode,
  RangeSet,
  RangeValue,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
  keymap,
} from "@codemirror/view";

import type { MetricDefinition } from "metabase-lib/metric";

import type {
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerFormulaEntity,
} from "../../../types/viewer-state";
import type { MetricIdentityEntry } from "../utils";
import { parseFullTextWithPositions, traverseMetricTokens } from "../utils";

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

// ── Identity tracking ──────────────────────────────────────────────────────

class MetricIdentity extends RangeValue {
  override mapMode = MapMode.TrackDel;
  // Don't absorb text inserted at range boundaries — the identity
  // must track exactly the original token span, not grow with adjacent edits.
  override startSide = 1;
  override endSide = -1;

  constructor(
    readonly sourceId: MetricSourceId,
    readonly definition: MetricDefinition | null,
  ) {
    super();
  }

  override eq(other: MetricIdentity) {
    return (
      this.sourceId === other.sourceId && this.definition === other.definition
    );
  }
}

export const setMetricIdentities =
  StateEffect.define<RangeSet<MetricIdentity>>();

export const metricIdentityField = StateField.define<RangeSet<MetricIdentity>>({
  create: () => RangeSet.empty,
  update(identities, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMetricIdentities)) {
        return effect.value;
      }
    }
    if (tr.docChanged) {
      return identities.map(tr.changes);
    }
    return identities;
  },
});

export function buildMetricIdentities(
  text: string,
  metricEntries: MetricDefinitionEntry[],
  entities: MetricsViewerFormulaEntity[],
): RangeSet<MetricIdentity> {
  const ranges: ReturnType<MetricIdentity["range"]>[] = [];

  traverseMetricTokens(text, metricEntries, entities, (visit) => {
    const sourceId =
      visit.kind === "standalone" ? visit.entity.id : visit.exprToken.sourceId;
    const definition =
      visit.kind === "standalone"
        ? visit.entity.definition
        : (visit.exprToken.definition ?? null);

    ranges.push(
      new MetricIdentity(sourceId, definition).range(
        visit.positioned.from,
        visit.positioned.to,
      ),
    );
  });

  return RangeSet.of(ranges, true);
}

/**
 * Reads the current metric identities from the CodeMirror state.
 * Positions are already in current-document coordinates (mapped automatically).
 */
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
    });
  });
  return result;
}

// ── Token highlighting ─────────────────────────────────────────────────────

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

/** Derives replace decorations from the metric ranges field (no re-parse). */
const metricDecorationsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const entriesChanged = tr.effects.some((e) => e.is(setMetricEntries));
    if (tr.docChanged || entriesChanged) {
      return rangesToDecorations(tr.state.field(metricTokenRangesField));
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
  metricIdentityField,
  metricTokenRangesField,
  metricDecorationsField,
  EditorView.atomicRanges.of((view) =>
    view.state.field(metricDecorationsField),
  ),
  metricTokenKeymap,
];
