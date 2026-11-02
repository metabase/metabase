import { useSyncExternalStore } from "react";

import type { SummaryDefinition } from "./types";

// Prototype-only, in-memory store: one summary per source table, kept for the
// lifetime of the page. Lib objects aren't serializable, so this stays out of Redux.
let summariesByKey: ReadonlyMap<string, SummaryDefinition> = new Map();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function update(nextSummaries: ReadonlyMap<string, SummaryDefinition>) {
  summariesByKey = nextSummaries;
  listeners.forEach((listener) => listener());
}

export const EMPTY_SUMMARY: SummaryDefinition = {
  rows: [],
  columns: [],
  values: [],
};

/** Returns the summary defined for `key`, or `undefined` when the table has no summary yet. */
export function useSummaryDefinition(
  key: string | null,
): SummaryDefinition | undefined {
  return useSyncExternalStore(subscribe, () =>
    key != null ? summariesByKey.get(key) : undefined,
  );
}

export function setSummaryDefinition(
  key: string,
  definition: SummaryDefinition,
) {
  update(new Map(summariesByKey).set(key, definition));
}

export function removeSummaryDefinition(key: string) {
  const nextSummaries = new Map(summariesByKey);
  nextSummaries.delete(key);
  update(nextSummaries);
}
