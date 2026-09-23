import { useSyncExternalStore } from "react";

import type { DashboardFocus } from "metabase/api/jev";

import { type CardShape, classifyKind } from "./classify-kind";
import { type FocusCardInput, packLayout } from "./layout-engine";

/**
 * A tiny shared store for the dashboard "focus" reflow. The Jev filter palette writes a focus result
 * here; DashboardGrid subscribes and re-flows its layout so relevant cards rise to the top and irrelevant
 * ones sink — animated by react-grid-layout — and the DashboardFocus chip shows what the dashboard is
 * focused on. Kept as a standalone observable (not Redux) so the feature stays self-contained and doesn't
 * touch dashboard state/save flow.
 */

interface FocusLayoutState {
  /** dashcard id -> relevance score (higher = more relevant). */
  scores: Record<number, number>;
  /** dashcard ids the backend marked focused (top-ranked). The rest are demoted. */
  focused: Set<number>;
}

export type FocusState =
  | (FocusLayoutState & { active: false; result: null })
  | (FocusLayoutState & { active: true; result: DashboardFocus });

const EMPTY: FocusState = {
  active: false,
  scores: {},
  focused: new Set(),
  result: null,
};

let state: FocusState = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function setFocus(result: DashboardFocus) {
  state = {
    active: true,
    scores: Object.fromEntries(
      result.cards.map((card) => [card.dashcard_id, card.score]),
    ),
    focused: new Set(
      result.cards
        .filter((card) => card.focused)
        .map((card) => card.dashcard_id),
    ),
    result,
  };
  emit();
}

export function clearFocus() {
  state = EMPTY;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

/** Subscribe a component to the focus state. */
export function useFocusState(): FocusState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Read the current focus state without subscribing (for non-hook call sites like the grid class). */
export function getFocusState(): FocusState {
  return state;
}

/** Subscribe imperatively (for the class-component grid). Returns an unsubscribe fn. */
export function subscribeFocus(listener: () => void): () => void {
  return subscribe(listener);
}

/** The subset of a react-grid-layout item this reflow reads/writes. */
type LayoutItem = { i: string; x: number; y: number; w: number; h: number };

/**
 * Re-flow a react-grid-layout by relevance AND kind. The focused cards (top-ranked by the backend) are
 * packed first, at full size, in kind bands; the demoted rest are packed below, shrunk — so even when
 * scores cluster tightly (a weak-fit question), the split is visible: relevant cards up top and big,
 * everything else small and out of the way. Within each zone, cards are resized by what they ARE (a
 * callout stays small, a table grows with its rows, a trend goes wide) and the geometry is mapped back
 * onto the caller's items so react-grid-layout animates the rearrangement.
 *
 * `shapeOf` reads a card's structural facts (display type, row count) from the rendered result; the grid
 * supplies it from its dashcardData. When a card's shape is unknown it falls back to "other".
 *
 * Returns a new layout array; does not mutate the input. Generic over the caller's item type so extra
 * fields (react-grid-layout's `minW`, `dashcard`, etc.) pass through untouched.
 */
export function reflowLayoutByScore<T extends LayoutItem>(
  layout: T[],
  scores: Record<number, number>,
  focused: Set<number>,
  shapeOf?: (dashcardId: number) => CardShape | undefined,
): T[] {
  const inputs: FocusCardInput[] = layout.map((item) => {
    const id = Number(item.i);
    const shape = shapeOf?.(id);
    return {
      id,
      kind: shape ? classifyKind(shape) : "other",
      score: scores[id] ?? 0,
      focused: focused.has(id),
      rowCount: shape?.rowCount,
      originalSize: { w: item.w, h: item.h },
    };
  });

  const placed = packLayout(inputs);
  const placedById = new Map(placed.map((p) => [p.id, p]));

  return layout.map((item) => {
    const p = placedById.get(Number(item.i));
    return p ? { ...item, x: p.x, y: p.y, w: p.w, h: p.h } : item;
  });
}
