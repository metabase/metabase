import * as I from "icepick";
import { useCallback, useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import type { ContentTranslationFunction } from "metabase/i18n/types";
import { isCartesianChart } from "metabase/visualizations";
import type { HoveredObject } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type {
  DictionaryArray,
  MaybeTranslatedSeries,
  RowValue,
  Series,
} from "metabase-types/api";

import { hasTranslations, useTranslateContent } from "./use-translate-content";

export type TranslateContentStringFunction = <
  MsgidType = string | boolean | null | undefined,
>(
  dictionary: DictionaryArray | undefined,
  locale: string | undefined,
  /** This argument will be translated only if it is a string. If it is not a
   * string, it will be returned untranslated. */
  msgid: MsgidType,
) => string | MsgidType;

/** Translate a user-generated string
 *
 * Terminology: A "msgid" is a 'raw', untranslated string. A "msgstr" is a
 * translation of a msgid.
 * */
export const translateContentString: TranslateContentStringFunction = (
  dictionary,
  locale,
  rawMsgid,
) => {
  if (!locale) {
    return rawMsgid;
  }

  if (typeof rawMsgid !== "string" && typeof rawMsgid !== "boolean") {
    return rawMsgid;
  }

  // Boolean values are matched against the dictionary as strings
  const msgid = typeof rawMsgid === "boolean" ? rawMsgid.toString() : rawMsgid;

  if (!msgid.trim()) {
    return msgid;
  }

  const lowerCaseMsgId = msgid.toLowerCase();

  const msgstr = dictionary?.find(
    (row) =>
      row.locale === locale && row.msgid.toLowerCase() === lowerCaseMsgId,
  )?.msgstr;

  if (!msgstr || !msgstr.trim()) {
    return msgid;
  }

  return msgstr;
};

export type ColumnDisplayNamePattern = (value: string) => string;

/**
 * Patterns for column display names.
 * These must match the patterns used in the backend:
 * - Aggregations: metabase.lib.aggregation
 * - Binning: metabase.lib.binning
 * - Temporal buckets: metabase.lib.temporal_bucket
 *
 * Each pattern is a function that takes a column name and returns the full display name.
 * More specific patterns must come before less specific ones.
 */
const COLUMN_DISPLAY_NAME_PATTERNS: ColumnDisplayNamePattern[] = [
  // Aggregation patterns (from metabase.lib.aggregation)
  // More specific patterns must come first
  (value: string) => t`Sum of ${value} matching condition`,
  (value: string) => t`Average of ${value}`,
  (value: string) => t`Count of ${value}`,
  (value: string) => t`Cumulative count of ${value}`,
  (value: string) => t`Cumulative sum of ${value}`,
  (value: string) => t`Distinct values of ${value}`,
  (value: string) => t`Max of ${value}`,
  (value: string) => t`Median of ${value}`,
  (value: string) => t`Min of ${value}`,
  (value: string) => t`Standard deviation of ${value}`,
  (value: string) => t`Sum of ${value}`,
  (value: string) => t`Variance of ${value}`,

  // Binning patterns (from metabase.lib.binning)
  // Auto binned (default strategy)
  (value: string) => t`${value}: Auto binned`,
  // Numeric binning strategies: num-bins (10, 50, 100)
  (value: string) => `${value}: 10 bins`,
  (value: string) => `${value}: 50 bins`,
  (value: string) => `${value}: 100 bins`,
  // Coordinate binning strategies: bin-width with degree symbol
  (value: string) => `${value}: 0.1°`,
  (value: string) => `${value}: 1°`,
  (value: string) => `${value}: 10°`,
  (value: string) => `${value}: 20°`,
  (value: string) => `${value}: 0.05°`,
  (value: string) => `${value}: 0.01°`,
  (value: string) => `${value}: 0.005°`,

  // Temporal bucket patterns (from metabase.lib.temporal_bucket)
  // Generated dynamically using the same Lib functions the backend uses,
  // ensuring the translated suffixes match (e.g., "Month" → "Monat" in German)
  ...Lib.availableTemporalUnits().map(
    (unit) => (value: string) => `${value}: ${Lib.describeTemporalUnit(unit)}`,
  ),
];

// Unique marker to find where the value placeholder is in a pattern
const VALUE_MARKER = "\u0000";

/**
 * Translates a column display name by recursively parsing known patterns
 * (aggregations, binning, temporal buckets) and translating the inner column name.
 *
 * Handles patterns where the value can be:
 * - At the start: "{value} של סכום" (Hebrew, right-to-left)
 * - At the end: "Sum of {value}" (English)
 * - Wrapped: "Somme de {value} totale" (hypothetical)
 *
 * Examples:
 * - "Total" => tc("Total") (no pattern matched)
 * - "Sum of Total" => t`Sum of ${tc("Total")}`
 * - "Sum of Min of Total" => t`Sum of ${t`Min of ${tc("Total")}`}`
 * - "Created At: Month" => t`${tc("Created At")}: Month`
 * - "Total: Auto binned" => t`${tc("Total")}: Auto binned`
 */
// Separator used for binning and temporal bucket suffixes (e.g., "Total: Day", "Total: 10 bins")
const COLON_SEPARATOR = ": ";

// Separator used for joined table column names (e.g., "Products → Created At")
// See: src/metabase/lib/field.cljc - field-display-name-add-fk-or-join-display-name
const JOIN_SEPARATOR = " → ";

// Separator used for implicit join aliases (e.g., "People - Product")
// See: src/metabase/lib/join.cljc - standard-join-name
const IMPLICIT_JOIN_SEPARATOR = " - ";

export const translateColumnDisplayName = (
  displayName: string,
  tc: ContentTranslationFunction,
  patterns: ColumnDisplayNamePattern[] = COLUMN_DISPLAY_NAME_PATTERNS,
): string => {
  if (!hasTranslations(tc)) {
    return displayName;
  }

  for (const pattern of patterns) {
    const withMarker = pattern(VALUE_MARKER);
    const markerIndex = withMarker.indexOf(VALUE_MARKER);

    const prefix = withMarker.substring(0, markerIndex);
    const suffix = withMarker.substring(markerIndex + VALUE_MARKER.length);

    const hasPrefix = displayName.startsWith(prefix);
    const hasSuffix = displayName.endsWith(suffix);

    if (hasPrefix && hasSuffix) {
      const innerStart = prefix.length;
      const innerEnd = displayName.length - suffix.length;

      if (innerStart <= innerEnd) {
        const innerPart = displayName.substring(innerStart, innerEnd);

        return pattern(translateColumnDisplayName(innerPart, tc, patterns));
      }
    }
  }

  // Handle colon-separated patterns for backend-translated temporal bucket suffixes
  // (e.g., "Created At: Monat" where "Monat" is already translated by the backend).
  // Explicit binning patterns are already handled above in COLUMN_DISPLAY_NAME_PATTERNS.
  const colonIndex = displayName.lastIndexOf(COLON_SEPARATOR);

  if (colonIndex > 0) {
    const columnPart = displayName.substring(0, colonIndex);
    const suffixPart = displayName.substring(
      colonIndex + COLON_SEPARATOR.length,
    );

    // Only split if the column part actually has a translation.
    // This avoids incorrectly splitting column names that contain ": " literally.
    const translatedColumn = translateColumnDisplayName(
      columnPart,
      tc,
      patterns,
    );
    if (translatedColumn !== columnPart) {
      return translatedColumn + COLON_SEPARATOR + suffixPart;
    }
  }

  // Handle joined table column names like "Products → Created At"
  // or nested joins like "Orders → Products → Created At: Monat"
  // We split on the FIRST arrow to preserve nested patterns in the column part.
  const arrowIndex = displayName.indexOf(JOIN_SEPARATOR);
  if (arrowIndex > 0) {
    const joinAliasPart = displayName.substring(0, arrowIndex);
    const columnPart = displayName.substring(
      arrowIndex + JOIN_SEPARATOR.length,
    );

    // The join alias may contain an implicit join separator " - " (e.g., "People - Product")
    // which combines the joined table name and the FK field name.
    // We only split on " - " here (within the arrow context) to avoid incorrectly
    // splitting question names or other strings that contain dashes.
    const dashIndex = joinAliasPart.indexOf(IMPLICIT_JOIN_SEPARATOR);
    let translatedJoinAlias: string;
    if (dashIndex > 0) {
      const tablePart = joinAliasPart.substring(0, dashIndex);
      const fkPart = joinAliasPart.substring(
        dashIndex + IMPLICIT_JOIN_SEPARATOR.length,
      );
      translatedJoinAlias =
        translateColumnDisplayName(tablePart, tc, patterns) +
        IMPLICIT_JOIN_SEPARATOR +
        translateColumnDisplayName(fkPart, tc, patterns);
    } else {
      translatedJoinAlias = translateColumnDisplayName(
        joinAliasPart,
        tc,
        patterns,
      );
    }

    // columnPart may have more patterns (arrows, colons, aggregations)
    return (
      translatedJoinAlias +
      JOIN_SEPARATOR +
      translateColumnDisplayName(columnPart, tc, patterns)
    );
  }

  // First try direct translation of the full display name
  const directTranslation = tc(displayName);
  if (directTranslation !== displayName) {
    return directTranslation;
  }

  // If no direct translation, try space-based iteration for filter patterns
  // (handles cases like "Created At is in the previous 3 months" where only the column name is translatable)
  // TODO: temporary code, in a follow up we will get this from CLJ side
  let lastTranslatedIndex = -1;
  let lastTranslatedColumn = "";

  for (let i = 0; i < displayName.length; i++) {
    if (displayName[i] === " ") {
      const columnPart = displayName.substring(0, i);
      const translatedColumn = translateColumnDisplayName(
        columnPart,
        tc,
        patterns,
      );

      if (translatedColumn !== columnPart) {
        lastTranslatedIndex = i;
        lastTranslatedColumn = translatedColumn;
      }
    }
  }

  if (lastTranslatedIndex > 0) {
    return lastTranslatedColumn + displayName.substring(lastTranslatedIndex);
  }

  return displayName;
};

const isRecord = (obj: unknown): obj is Record<string, unknown> =>
  _.isObject(obj) && Object.keys(obj).every((key) => typeof key === "string");

/** Walk through obj and translate any display name fields */
export const translateDisplayNames = <T>(
  obj: T,
  tc: ContentTranslationFunction,
  fieldsToTranslate = ["display_name", "displayName"],
): T => {
  if (!hasTranslations(tc)) {
    return obj;
  }

  const traverse = (element: T): T => {
    if (Array.isArray(element)) {
      return element.map((item) => traverse(item)) as T;
    }

    if (isRecord(element)) {
      return Object.entries(element).reduce((acc, [key, value]) => {
        const shouldTranslate =
          fieldsToTranslate.includes(key as string) &&
          typeof value === "string";

        // We can't detect if an element has a special pattern (aggregation, binning, temporal bucket) or not here.
        // We can't rely on the `source` field as for cases when a question containing aggregations is a base for another question,
        // the `source` field contains the `fields` value, not the `aggregation` one.
        // As the solution, we always try to translate the display name using pattern matching,
        // and inside `translateColumnDisplayName` we fallback to regular tc() call if no pattern is matched.
        const newValue = shouldTranslate
          ? translateColumnDisplayName(value as string, tc)
          : traverse(value as T);

        return I.assoc(acc, key, newValue);
      }, element);
    }

    return element;
  };

  return traverse(obj);
};

export const translateFieldValuesInHoveredObject = (
  obj: HoveredObject | null,
  tc?: ContentTranslationFunction,
) => {
  if (!hasTranslations(tc)) {
    return obj;
  }
  return {
    ...obj,
    data: obj?.data?.map((row) => {
      const { value, col } = row;

      return {
        ...row,
        value: col && typeof value === "string" ? tc(value) : value,
      };
    }),
  };
};

export const useTranslateFieldValuesInHoveredObject = (
  obj: HoveredObject | null,
) => {
  const tc = useTranslateContent();
  return useMemo(() => {
    return translateFieldValuesInHoveredObject(obj, tc);
  }, [obj, tc]);
};

export const translateFieldValuesInSeries = (
  series: Series,
  tc: ContentTranslationFunction,
): MaybeTranslatedSeries => {
  if (!hasTranslations(tc)) {
    return series;
  }
  return series.map((singleSeries) => {
    if (!singleSeries.data) {
      return singleSeries;
    }
    const untranslatedRows = singleSeries.data.rows.concat();

    const defaultFn = () => {
      return singleSeries.data.rows.map((row) => row.map((value) => tc(value)));
    };

    const translatedRows: RowValue[][] = match(singleSeries.card?.display)
      .with("pie", () => {
        const pieRows =
          singleSeries.card.visualization_settings?.["pie.rows"] ?? [];
        const keyToNameMap = Object.fromEntries(
          pieRows.map((row) => [row.key, row.name]),
        );

        // The pie chart relies on the rows to generate its legend,
        // which is why we need to translate them too
        // They're in the format of:
        // [
        //   ["Doohickey", 123],
        //   ["Widget", 456],
        //   ...
        // ]
        //
        return singleSeries.data.rows.map((row) =>
          row.map((value) => {
            if (
              typeof value === "string" &&
              keyToNameMap[value] !== undefined
            ) {
              return tc(keyToNameMap[value]);
            }
            return tc(value);
          }),
        );
      })
      .with(P.when(isCartesianChart), () => {
        // cartesian charts have series settings that can provide display names
        // for fields, which we should translate if available
        const seriesSettings =
          singleSeries.card.visualization_settings?.series_settings ?? {};

        return singleSeries.data.rows.map((row) =>
          row.map((value) => {
            if (
              typeof value === "string" &&
              seriesSettings[value]?.title !== undefined
            ) {
              return tc(seriesSettings[value].title);
            }
            return tc(value);
          }),
        );
      })
      .otherwise(defaultFn);

    return {
      ...singleSeries,
      data: {
        ...singleSeries.data,
        untranslatedRows,
        rows: translatedRows,
      },
    };
  });
};

export const translateCardNames = (
  series: Series,
  tc: ContentTranslationFunction,
) => {
  if (!hasTranslations(tc)) {
    return series;
  }
  return series.map((s) =>
    s.card?.name ? I.setIn(s, ["card", "name"], tc(s.card.name)) : s,
  );
};

export const useTranslateSeries = (series: Series) => {
  const tc = useTranslateContent();
  return useMemo(() => {
    if (!hasTranslations(tc)) {
      return series;
    }
    const withTranslatedDisplayNames = translateDisplayNames(series, tc);

    const withTranslatedCardNames = translateCardNames(
      withTranslatedDisplayNames,
      tc,
    );

    // Do not translate field values here if display is a map, since this can
    // break the map
    if (series?.[0]?.card?.display === "map") {
      return withTranslatedCardNames;
    }

    return translateFieldValuesInSeries(withTranslatedCardNames, tc);
  }, [series, tc]);
};

/** Returns a function that can be used to sort user-generated strings in an
 * array by their translations. */
export const useSortByContentTranslation = () => {
  const tc = useTranslateContent();
  // What makes this sort translation-aware is the use of the tc function.
  // 'localeCompare' is just a standard way of comparing two strings
  // alphabetically.
  return useCallback(
    (a: string, b: string) => tc(a).localeCompare(tc(b)),
    [tc],
  );
};
