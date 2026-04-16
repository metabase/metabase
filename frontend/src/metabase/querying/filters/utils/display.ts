import type { ContentTranslationFunction } from "metabase/i18n/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import * as Lib from "metabase-lib";

export const getTranslatedFilterDisplayName = (
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
  tc: ContentTranslationFunction,
  locale: string,
): string => {
  const displayInfo = Lib.displayInfo(query, stageIndex, filter);

  return PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName({
    displayName: displayInfo.longDisplayName,
    tc,
    locale,
  });
};
