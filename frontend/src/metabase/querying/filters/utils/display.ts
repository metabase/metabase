import { t } from "ttag";

import type { ContentTranslationFunction } from "metabase/content-translation/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { formatDate } from "metabase/querying/common/utils/dates";
import * as Lib from "metabase-lib";

const MAX_INLINE_FILTER_VALUES = 3;

type DetailedFilterParts = {
  operator: "=" | "!=";
  column: Lib.ColumnMetadata;
  values: Array<string | number | boolean | Date>;
  hasTime?: boolean;
};

function getExpressionFilterParts(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
): DetailedFilterParts | null {
  const { operator, args } = Lib.expressionParts(query, stageIndex, filter);
  const [column, ...rawValues] = args;

  if (
    (operator !== "=" && operator !== "!=") ||
    !Lib.isColumnMetadata(column) ||
    rawValues.length < 2
  ) {
    return null;
  }

  if (
    Lib.isTemporal(column) &&
    rawValues.every((value) => typeof value === "string")
  ) {
    const hasTime = rawValues.some((value) => value.includes("T"));
    const values = rawValues.map(
      (value) => new Date(value.includes("T") ? value : `${value}T00:00:00`),
    );

    return values.every((value) => !Number.isNaN(value.valueOf()))
      ? { operator, column, values, hasTime }
      : null;
  }

  const values = rawValues.filter(
    (value): value is string | number | boolean =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean",
  );

  return values.length === rawValues.length
    ? { operator, column, values }
    : null;
}

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
    Lib.numberFilterParts(query, stageIndex, filter) ??
    Lib.booleanFilterParts(query, stageIndex, filter) ??
    Lib.specificDateFilterParts(query, stageIndex, filter) ??
    getExpressionFilterParts(query, stageIndex, filter);

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
  const visibleValues = parts.values
    .slice(0, MAX_INLINE_FILTER_VALUES)
    .map((value) =>
      value instanceof Date
        ? formatDate(value, Boolean("hasTime" in parts && parts.hasTime))
        : String(value),
    );
  const remainingValueCount = parts.values.length - visibleValues.length;
  const values =
    remainingValueCount > 0
      ? `${visibleValues.join(", ")} +${t`${remainingValueCount} more`}`
      : visibleValues.join(", ");

  return `${columnName} ${operator} ${values}`;
};
