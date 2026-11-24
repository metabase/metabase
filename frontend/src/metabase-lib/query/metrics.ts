/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- FIXME: any-typed values */
import * as ML from "cljs/metabase.lib.js";

import type { MetricMetadata, Query } from "./types";

export function availableMetrics(
  query: Query,
  stageIndex: number,
): MetricMetadata[] {
  return ML.available_metrics(query, stageIndex);
}
