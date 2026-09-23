import { useSyncExternalStore } from "react";

import { type CardShape, classifyKind } from "./classify-kind";
import { type FocusCardInput, packLayout } from "./layout-engine";

/**
 * A tiny shared store for the dashboard "focus" reflow. The DashboardFocus panel writes per-dashcard
 * relevance scores here; DashboardGrid subscribes and re-flows its layout so relevant cards rise to the
 * top and irrelevant ones sink — animated by react-grid-layout. Kept as a standalone observable (not
 * Redux) so the feature stays self-contained and doesn't touch dashboard state/save flow.
 */

export interface FocusState {
  /** Whether a focus is active (a question has been asked). */
  active: boolean;
  /** dashcard id -> relevance score (higher = more relevant). */
  scores: Record<number, number>;
}

const EMPTY: FocusState = { active: false, scores: {} };

let state: FocusState = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function setFocus(scores: Record<number, number>) {
  state = { active: true, scores };
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
 * Re-flow a react-grid-layout by relevance AND kind. Cards are ordered by score (most relevant first),
 * then each is resized and repacked by what it IS (a callout stays small, a table grows with its rows, a
 * trend goes wide) via the layout engine, and the resulting geometry is mapped back onto the caller's
 * items — so react-grid-layout animates the whole rearrangement. This is the fix for the old "staircase":
 * we no longer preserve each card's original width/column, we recompute them from kind × score.
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
  shapeOf?: (dashcardId: number) => CardShape | undefined,
): T[] {
  // Sort by score descending; unscored cards (score undefined) sort as 0 but keep stable order.
  const scoreOf = (item: LayoutItem) => scores[Number(item.i)] ?? 0;
  const ordered = [...layout].sort((a, b) => scoreOf(b) - scoreOf(a));

  const inputs: FocusCardInput[] = ordered.map((item) => {
    const id = Number(item.i);
    const shape = shapeOf?.(id);
    return {
      id,
      kind: shape ? classifyKind(shape) : "other",
      score: scores[id] ?? 0,
      rowCount: shape?.rowCount,
      originalSize: { w: item.w, h: item.h },
    };
  });

  const placed = packLayout(inputs);
  const placedById = new Map(placed.map((p) => [p.id, p]));

  return ordered.map((item) => {
    const p = placedById.get(Number(item.i));
    return p ? { ...item, x: p.x, y: p.y, w: p.w, h: p.h } : item;
  });
}
