import * as ML from "cljs/metabase.lib.js";

import type { MeasureMetadata, Query } from "./types";

export function availableMeasures(
  query: Query,
  stageIndex: number,
): MeasureMetadata[] {
  return ML.available_measures(query, stageIndex);
}

export function isMeasureMetadata(arg: unknown): arg is MeasureMetadata {
  return ML.measure_metadata_QMARK_(arg);
}
