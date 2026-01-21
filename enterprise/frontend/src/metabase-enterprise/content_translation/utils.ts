import * as I from "icepick";
import { useCallback, useMemo } from "react";
import { P, match } from "ts-pattern";
import _ from "underscore";

import type { ContentTranslationFunction } from "metabase/i18n/types";
import { isCartesianChart } from "metabase/visualizations";
import type { HoveredObject } from "metabase/visualizations/types";
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
  const traverse = (o: T): T => {
    if (Array.isArray(o)) {
      return o.map((item) => traverse(item)) as T;
    }
    if (isRecord(o)) {
      return Object.entries(o).reduce((acc, [key, value]) => {
        const newValue =
          fieldsToTranslate.includes(key as string) && typeof value === "string"
            ? tc(value)
            : traverse(value as T);
        return I.assoc(acc, key, newValue);
      }, o);
    }
    return o;
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

/**
 * Translates a filter's display name by translating the column name part.
 * The longDisplayName is a pre-formatted string like "Plan is Business"
 * where the column name part needs to be translated.
 */
export const getTranslatedFilterDisplayName = (
  displayName: string,
  tc: ContentTranslationFunction,
  columnDisplayName?: string,
): string => {
  if (!displayName) {
    return displayName ?? "";
  }

  if (!hasTranslations(tc)) {
    return displayName;
  }

  if (columnDisplayName) {
    const translatedColumnName = tc(columnDisplayName);

    if (translatedColumnName !== columnDisplayName) {
      return displayName.replace(columnDisplayName, translatedColumnName);
    }
  }

  // Fallback to translate the whole string
  return tc(displayName);
};
