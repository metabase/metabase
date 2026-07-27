import { t } from "ttag";

import type { ContentTranslationFunction } from "metabase/content-translation/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import * as Lib from "metabase-lib";

const MAX_INLINE_FILTER_VALUES = 3;

function getTranslatedColumnDisplayName(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  tc: ContentTranslationFunction,
  locale: string,
) {
  return PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName({
    displayName: Lib.displayInfo(query, stageIndex, column).longDisplayName,
    tc,
    locale,
  });
}

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

/**
 * Returns a more informative label for filters with multiple literal values.
 * Lib's default display name deliberately collapses those filters to
 * "N selections", which is useful in compact query-builder controls but not
 * when reviewing a mined definition. Long lists are truncated.
 */
export const getDetailedTranslatedFilterDisplayName = (
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
  tc: ContentTranslationFunction,
  locale: string,
): string => {
  const parts =
    Lib.stringFilterParts(query, stageIndex, filter) ??
    Lib.numberFilterParts(query, stageIndex, filter);

  if (!parts || parts.values.length < 2) {
    return getTranslatedFilterDisplayName(
      query,
      stageIndex,
      filter,
      tc,
      locale,
    );
  }

  const columnName = getTranslatedColumnDisplayName(
    query,
    stageIndex,
    parts.column,
    tc,
    locale,
  );
  const operator =
    parts.operator === "="
      ? t`is one of`
      : parts.operator === "!="
        ? t`is not one of`
        : Lib.describeFilterOperator(parts.operator).toLowerCase();
  const visibleValues = parts.values.slice(0, MAX_INLINE_FILTER_VALUES);
  const remainingValueCount = parts.values.length - visibleValues.length;
  const values =
    remainingValueCount > 0
      ? `${visibleValues.join(", ")} +${t`${remainingValueCount} more`}`
      : visibleValues.join(", ");

  return `${columnName} ${operator} ${values}`;
};
