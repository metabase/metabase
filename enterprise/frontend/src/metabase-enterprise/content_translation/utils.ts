import * as I from "icepick";
import { useCallback, useMemo } from "react";
import { P, match } from "ts-pattern";
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

/**
 * Pattern function that takes a value and returns the full display name.
 * Used for custom aggregation patterns (RTL languages, wrapped patterns, etc.)
 *
 * @example
 * // English: "Sum of {value}"
 * (value) => `Sum of ${value}`
 *
 * // Hebrew RTL: "{value} של סכום"
 * (value) => `${value} של סכום`
 *
 * // French wrapped: "Somme de {value} totale"
 * (value) => `Somme de ${value} totale`
 */
export type ColumnDisplayNamePattern = (value: string) => string;

/**
 * Translates by parsing display name into parts and translating each translatable part.
 */
const translateByParts = (
  displayName: string,
  tc: ContentTranslationFunction,
): string => {
  const parts = Lib.parseColumnDisplayNameParts(displayName);

  let anyChanged = false;
  const translated = parts.map((part) => {
    if (part.type === "translatable") {
      const result = tc(part.value);

      if (result !== part.value) {
        anyChanged = true;
      }

      return result;
    }

    return part.value;
  });

  // If no translation applied, parsing may have been wrong
  // (e.g., "Note: Important" is a column name, not temporal bucket).
  // Fall back to translating the whole string.
  return anyChanged ? translated.join("") : tc(displayName);
};

/**
 * Translates a column display name by parsing it into translatable parts.
 *
 * Uses CLJ-side parsing (metabase.lib.util/parse-column-display-name-parts) which handles:
 * - Aggregation patterns: "Sum of X", "Distinct values of X matching condition"
 * - Join patterns: "Products → Created At"
 * - Implicit joins: "People - Product → Created At"
 * - Temporal buckets: "Created At: Month"
 *
 * @example
 * translateColumnDisplayName("Sum of Total", tc)
 * // => "Sum of " + tc("Total")
 * translateColumnDisplayName("Products → Created At: Month", tc)
 * // => tc("Products") + " → " + tc("Created At") + ": " + "Month"
 */
export const translateColumnDisplayName = (
  displayName: string,
  tc: ContentTranslationFunction,
  patterns?: ColumnDisplayNamePattern[],
): string => {
  if (!hasTranslations(tc)) {
    return displayName;
  }

  // Custom patterns (RTL, wrapped) require the legacy TS-based parser
  if (patterns) {
    return translateWithCustomPatterns(displayName, tc, patterns);
  }

  return translateByParts(displayName, tc);
};

/** Marker used to find where the value placeholder is in a pattern */
const VALUE_MARKER = "\u0000";

/**
 * Extracts prefix and suffix from a pattern function.
 *
 * @example
 * extractPrefixSuffix((v) => `Sum of ${v}`) // => { prefix: "Sum of ", suffix: "" }
 * extractPrefixSuffix((v) => `${v} של סכום`) // => { prefix: "", suffix: " של סכום" }
 */
const extractPrefixSuffix = (
  pattern: ColumnDisplayNamePattern,
): { prefix: string; suffix: string } => {
  const withMarker = pattern(VALUE_MARKER);
  const markerIndex = withMarker.indexOf(VALUE_MARKER);

  return {
    prefix: withMarker.substring(0, markerIndex),
    suffix: withMarker.substring(markerIndex + VALUE_MARKER.length),
  };
};

/**
 * Translates using custom patterns. Supports RTL and wrapped patterns.
 * Recursively handles nested patterns, joins, and temporal buckets.
 */
const translateWithCustomPatterns = (
  displayName: string,
  tc: ContentTranslationFunction,
  patterns: ColumnDisplayNamePattern[],
): string => {
  // Try each aggregation pattern
  for (const pattern of patterns) {
    const { prefix, suffix } = extractPrefixSuffix(pattern);

    const hasPrefix = displayName.startsWith(prefix);
    const hasSuffix = displayName.endsWith(suffix);

    if (hasPrefix && hasSuffix && (prefix || suffix)) {
      const innerStart = prefix.length;
      const innerEnd = displayName.length - suffix.length;

      if (innerStart <= innerEnd) {
        const innerPart = displayName.substring(innerStart, innerEnd);

        return pattern(translateWithCustomPatterns(innerPart, tc, patterns));
      }
    }
  }

  // Try colon-separated pattern (temporal bucket / binning)
  const colonIndex = displayName.lastIndexOf(Lib.COLUMN_DISPLAY_NAME_SEPARATOR);
  if (colonIndex > 0) {
    const columnPart = displayName.substring(0, colonIndex);
    const suffixPart = displayName.substring(
      colonIndex + Lib.COLUMN_DISPLAY_NAME_SEPARATOR.length,
    );
    const translatedColumn = translateWithCustomPatterns(
      columnPart,
      tc,
      patterns,
    );

    if (translatedColumn !== columnPart) {
      return translatedColumn + Lib.COLUMN_DISPLAY_NAME_SEPARATOR + suffixPart;
    }
  }

  // Try join pattern (arrow separator)
  const arrowIndex = displayName.indexOf(Lib.JOIN_DISPLAY_NAME_SEPARATOR);

  if (arrowIndex > 0) {
    const joinAlias = displayName.substring(0, arrowIndex);
    const columnPart = displayName.substring(
      arrowIndex + Lib.JOIN_DISPLAY_NAME_SEPARATOR.length,
    );

    const translatedAlias = translateJoinAlias(joinAlias, tc, patterns);
    const translatedColumn = translateWithCustomPatterns(
      columnPart,
      tc,
      patterns,
    );

    return translatedAlias + Lib.JOIN_DISPLAY_NAME_SEPARATOR + translatedColumn;
  }

  return tc(displayName);
};

/**
 * Translates a join alias, handling implicit joins (dash separator).
 */
const translateJoinAlias = (
  joinAlias: string,
  tc: ContentTranslationFunction,
  patterns: ColumnDisplayNamePattern[],
): string => {
  const dashIndex = joinAlias.indexOf(Lib.IMPLICIT_JOIN_DISPLAY_NAME_SEPARATOR);

  if (dashIndex > 0) {
    // Implicit join: "People - Product"
    const tablePart = joinAlias.substring(0, dashIndex);
    const fkPart = joinAlias.substring(
      dashIndex + Lib.IMPLICIT_JOIN_DISPLAY_NAME_SEPARATOR.length,
    );

    return (
      translateWithCustomPatterns(tablePart, tc, patterns) +
      Lib.IMPLICIT_JOIN_DISPLAY_NAME_SEPARATOR +
      translateWithCustomPatterns(fkPart, tc, patterns)
    );
  }

  // Simple join alias
  return translateWithCustomPatterns(joinAlias, tc, patterns);
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
