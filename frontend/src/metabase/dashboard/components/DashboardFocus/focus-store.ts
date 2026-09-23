import { useSyncExternalStore } from "react";

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
 * Re-flow a react-grid-layout by relevance: cards with higher scores move to the top, lower scores sink
 * to the bottom. Preserves each card's width/height and column, only rewriting the row (`y`), so
 * react-grid-layout animates the vertical slide. Cards with no score keep their relative order in the
 * middle. Returns a new layout array; does not mutate the input. Generic over the caller's item type so
 * extra fields (react-grid-layout's `minW`, `dashcard`, etc.) pass through untouched.
 */
export function reflowLayoutByScore<T extends LayoutItem>(
  layout: T[],
  scores: Record<number, number>,
): T[] {
  // Sort by score descending; unscored cards (score undefined) sort as 0 but keep stable order.
  const scoreOf = (item: LayoutItem) => scores[Number(item.i)] ?? 0;
  const ordered = [...layout].sort((a, b) => scoreOf(b) - scoreOf(a));

  // Greedy vertical packing across GRID_COLUMNS: place each card at the lowest row where its column
  // span fits, keeping its original x/w. columnBottoms tracks the current filled height per column.
  const GRID_COLUMNS = 24;
  const columnBottoms = new Array(GRID_COLUMNS).fill(0);

  return ordered.map((item) => {
    const x = Math.max(0, Math.min(item.x, GRID_COLUMNS - item.w));
    // The row is the max filled height across the columns this card spans.
    let y = 0;
    for (let c = x; c < x + item.w && c < GRID_COLUMNS; c++) {
      y = Math.max(y, columnBottoms[c]);
    }
    for (let c = x; c < x + item.w && c < GRID_COLUMNS; c++) {
      columnBottoms[c] = y + item.h;
    }
    return { ...item, x, y };
  });
}
