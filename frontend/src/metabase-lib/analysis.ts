import * as ML from "cljs/metabase.lib.js";

export function buildProductAnalyticsQuery(analysisState) {
  return ML.analysis_state_to_mbql(analysisState);
}
