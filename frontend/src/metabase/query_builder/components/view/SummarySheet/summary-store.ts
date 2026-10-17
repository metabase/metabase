import { createKeyedStore } from "../keyed-store";

import type { SummaryDefinition } from "./types";

// one summary per source table
const summaryStore = createKeyedStore<SummaryDefinition>();

export const EMPTY_SUMMARY: SummaryDefinition = {
  rows: [],
  columns: [],
  values: [],
};

/** Returns the summary defined for `key`, or `undefined` when the table has no summary yet. */
export const useSummaryDefinition = summaryStore.useValue;
export const setSummaryDefinition = summaryStore.set;
