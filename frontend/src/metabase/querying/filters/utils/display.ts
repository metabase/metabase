import type { ContentTranslationFunction } from "metabase/i18n/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import * as Lib from "metabase-lib";

export const getTranslatedFilterDisplayName = (
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
  tc: ContentTranslationFunction,
): string => {
  const displayInfo = Lib.displayInfo(query, stageIndex, filter);
  const parts = Lib.filterParts(query, stageIndex, filter);
  const columnDisplayName = parts?.column
    ? Lib.displayInfo(query, stageIndex, parts.column).displayName
    : undefined;

  return PLUGIN_CONTENT_TRANSLATION.getTranslatedFilterDisplayName(
    displayInfo.longDisplayName ?? "",
    tc,
    columnDisplayName,
  );
};
