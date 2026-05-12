import * as I from "icepick";
import { useCallback, useMemo } from "react";
import { P, match } from "ts-pattern";
import _ from "underscore";

import { useLocale } from "metabase/common/hooks";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { isCartesianChart } from "metabase/visualizations";
import type { HoveredObject } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type {
  DictionaryArray,
  MaybeTranslatedSeries,
  RowValue,
  Series,
  SeriesSettings,
} from "metabase-types/api";

import { hasTranslations, useTranslateContent } from "./use-translate-content";

export type TranslateContentStringFunction = typeof translateContentString;

/**
 * Translate a user-generated string
 *
 * Terminology: A "msgid" is a 'raw', untranslated string. A "msgstr" is a
 * translation of a msgid.
 *
 * @param dictionary - The dictionary to use for translations
 * @param locale - The locale to translate string to
 * @param rawMsgid -
 *   The value to translate
 *   This argument will be translated only if it is a string or boolean.
 */
export function translateContentString<T>(
  dictionary: DictionaryArray | undefined,
  locale: string | undefined,
  rawMsgid: T,
): string | T {
  if (!locale) {
    return rawMsgid;
  }

  if (Array.isArray(rawMsgid)) {
    return rawMsgid.map((msgid) =>
      translateContentString(dictionary, locale, msgid),
    ) as T;
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
}

/**
 * Translates a column display name by parsing it into translatable and static
 * parts, translating only the translatable parts, and reassembling.
 *
 * Parsing is done on the CLJ side via `Lib.parseColumnDisplayNameParts` which
 * handles aggregations, joins, implicit joins, temporal buckets, filters,
 * compound filters, binning, and RTL/wrapped locale patterns.
 *
 * If parsing yields no actual translations (e.g. the column name itself has no
 * entry in the dictionary), falls back to translating the whole string via tc().
 *
 * The `locale` field used for caching on the CLJS side
 *
 * @example
 * translateColumnDisplayName({ displayName: "Sum of Total", tc, locale: "en" })
 * // => "Sum of " + tc("Total")
 * translateColumnDisplayName({ displayName: "Products → Created At: Month", tc, locale: "en" })
 * // => tc("Products") + " → " + tc("Created At") + ": " + "Month"
 */
export const translateColumnDisplayName = ({
  displayName,
  tc,
  locale,
}: {
  displayName: string;
  tc: ContentTranslationFunction;
  locale: string;
}): string => {
  if (!hasTranslations(tc)) {
    return displayName;
  }

  const parts = Lib.parseColumnDisplayNameParts(displayName, locale);

  let anyTranslated = false;
  const translated = parts.map((part) => {
    if (part.type === "translatable") {
      const result = tc(part.value);

      if (result !== part.value) {
        anyTranslated = true;
      }

      return result;
    }

    return part.value;
  });

  // Fall back to translating the whole string if no part was individually
  // translated — covers mis-parsing or simply missing dictionary entries.
  return anyTranslated ? translated.join("") : tc(displayName);
};

const isRecord = (obj: unknown): obj is Record<string, unknown> =>
  _.isObject(obj) && Object.keys(obj).every((key) => typeof key === "string");

/** Walk through obj and translate any display name fields */
export const translateDisplayNames = <T>({
  obj,
  tc,
  locale,
  fieldsToTranslate = ["display_name", "displayName"],
}: {
  obj: T;
  tc: ContentTranslationFunction;
  locale: string;
  fieldsToTranslate?: string[];
}): T => {
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
          ? translateColumnDisplayName({
              displayName: value as string,
              tc,
              locale,
            })
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
  tc: ContentTranslationFunction,
): ((series: Series) => MaybeTranslatedSeries) => {
  if (!hasTranslations(tc)) {
    return (series) => series;
  }
  return (series) =>
    series.map((singleSeries) => {
      if (!singleSeries.data) {
        return singleSeries;
      }
      const untranslatedRows = singleSeries.data.rows.concat();

      const defaultFn = () => {
        return singleSeries.data.rows.map((row) =>
          row.map((value) => tc(value)),
        );
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

export const translateCardNames = (tc: ContentTranslationFunction) => {
  if (!hasTranslations(tc)) {
    return (series: Series) => series;
  }
  return (series: Series) =>
    series.map((s) =>
      s.card?.name ? I.setIn(s, ["card", "name"], tc(s.card.name)) : s,
    );
};

/** Translate the `title` in each metric's `series_settings` entry.
 *
 * Only keys listed in `graph.metrics` are translated; other
 * `series_settings` entries (e.g. dimension keys) are left untouched.
 *
 * @example
 * // Given series_settings: { revenue: { title: "Revenue" } }
 * // and graph.metrics: ["revenue"]
 * // ➜ series_settings: { revenue: { title: tc("Revenue") } }
 */
export const translateSeriesNames = (tc: ContentTranslationFunction) => {
  return (series: Series) => {
    if (!hasTranslations(tc)) {
      return series;
    }

    return series.map((singleSeries) => {
      const seriesSettings =
        singleSeries.card?.visualization_settings?.series_settings;
      const metrics =
        singleSeries.card?.visualization_settings["graph.metrics"];

      if (!seriesSettings || !metrics) {
        return singleSeries;
      }

      const translated = Object.fromEntries(
        metrics
          .filter((metric) => seriesSettings[metric])
          .map((metric) => [
            metric,
            {
              ...seriesSettings[metric],
              title: tc(seriesSettings[metric]!.title),
            },
          ]),
      );

      return I.updateIn(
        singleSeries,
        ["card", "visualization_settings", "series_settings"],
        (settings: Record<string, SeriesSettings>) => ({
          ...settings,
          ...translated,
        }),
      );
    });
  };
};

const curriedTranslatedDisplayNames = (
  tc: ContentTranslationFunction,
  locale: string,
) => {
  return (series: Series) => {
    return translateDisplayNames({ obj: series, tc, locale });
  };
};

const identity = (series: Series) => series;

export const useTranslateSeries = (series: Series) => {
  const tc = useTranslateContent();
  const { locale } = useLocale();

  return useMemo(() => {
    if (!hasTranslations(tc)) {
      return series;
    }

    const isMap = series?.[0]?.card?.display === "map";

    return [
      curriedTranslatedDisplayNames(tc, locale),
      translateCardNames(tc),
      translateSeriesNames(tc),
      // Do not translate field values for maps, since this can break the map
      isMap ? identity : translateFieldValuesInSeries(tc),
    ].reduce((result, fn) => fn(result), series);
  }, [series, tc, locale]);
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
