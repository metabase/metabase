import { t } from "ttag";

import type { ContentTranslationFunction } from "metabase/content-translation/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { formatDate } from "metabase/querying/common/utils/dates";
import { getTranslatedFilterDisplayName } from "metabase/querying/filters/utils/display";
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

/**
 * Expands literal multi-value filters for the cleanup review UI instead of using Lib's compact
 * "N selections" label. Long lists stay bounded so candidate rows remain scannable.
 */
export function getDetailedTranslatedFilterDisplayName(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
  tc: ContentTranslationFunction,
  locale: string,
): string {
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
  const visibleValues = parts.values
    .slice(0, MAX_INLINE_FILTER_VALUES)
    .map((value) =>
      value instanceof Date
        ? formatDate(value, Boolean("hasTime" in parts && parts.hasTime))
        : String(value),
    );
  const remainingValueCount = parts.values.length - visibleValues.length;
  const values = visibleValues.join(", ");

  if (parts.operator === "=") {
    return remainingValueCount > 0
      ? t`${columnName} is one of ${values} and ${remainingValueCount} more`
      : t`${columnName} is one of ${values}`;
  }

  if (parts.operator === "!=") {
    return remainingValueCount > 0
      ? t`${columnName} is not one of ${values} and ${remainingValueCount} more`
      : t`${columnName} is not one of ${values}`;
  }

  return getTranslatedFilterDisplayName(query, stageIndex, filter, tc, locale);
}
