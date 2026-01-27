import type { ContentTranslationFunction } from "metabase/i18n/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import * as Lib from "metabase-lib";

export const getTranslatedAggregationDisplayName = (
  query: Lib.Query,
  stageIndex: number,
  aggregation: Lib.AggregationClause,
  tc: ContentTranslationFunction,
): string => {
  const displayInfo = Lib.displayInfo(query, stageIndex, aggregation);

  return PLUGIN_CONTENT_TRANSLATION.getTranslatedAggregationDisplayName(
    displayInfo.longDisplayName ?? displayInfo.displayName ?? "",
    tc,
    displayInfo.sourceColumnDisplayName,
  );
};
