import { useSyncExternalStore } from "react";

import type { SummaryCanvasState } from "./types";

// Prototype-only, in-memory store: one canvas per source table, kept for the
// lifetime of the page. Lib objects aren't serializable, so this stays out of Redux.
let canvasesByKey: ReadonlyMap<string, SummaryCanvasState> = new Map();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function update(nextCanvases: ReadonlyMap<string, SummaryCanvasState>) {
  canvasesByKey = nextCanvases;
  listeners.forEach((listener) => listener());
}

/** Returns the canvas for `key`, or `undefined` when the table has no summaries yet. */
export function useSummaryCanvas(
  key: string | null,
): SummaryCanvasState | undefined {
  return useSyncExternalStore(subscribe, () =>
    key != null ? canvasesByKey.get(key) : undefined,
  );
}

export function getSummaryCanvas(key: string): SummaryCanvasState | undefined {
  return canvasesByKey.get(key);
}

export function setSummaryCanvas(key: string, canvas: SummaryCanvasState) {
  update(new Map(canvasesByKey).set(key, canvas));
}

/** Applies `updater` to the latest canvas, so async callers don't overwrite newer edits. */
export function updateSummaryCanvas(
  key: string,
  updater: (canvas: SummaryCanvasState) => SummaryCanvasState,
) {
  const canvas = canvasesByKey.get(key);
  if (canvas) {
    setSummaryCanvas(key, updater(canvas));
  }
}

export function removeSummaryCanvas(key: string) {
  const nextCanvases = new Map(canvasesByKey);
  nextCanvases.delete(key);
  update(nextCanvases);
}
