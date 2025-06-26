import { useCallback, useMemo } from "react";

import type { ContentTranslationFunction } from "metabase/i18n/types";
import type { HoveredObject } from "metabase/visualizations/types";
import type { Series } from "metabase-types/api";

import { useTranslateContent } from "./use-translate-content";
import {
  hasTranslations,
  translateCardNames,
  translateDisplayNames,
} from "./utils";

export const useTranslateFieldValuesInHoveredObject = (
  obj: HoveredObject | null,
) => {
  const tc = useTranslateContent();
  return useMemo(() => {
    return translateFieldValuesInHoveredObject(obj, tc);
  }, [obj, tc]);
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

export const translateFieldValuesInSeries = (
  series: Series,
  tc: ContentTranslationFunction,
) => {
  if (!hasTranslations(tc)) {
    return series;
  }
  return series.map((singleSeries) => {
    if (!singleSeries.data) {
      return singleSeries;
    }
    const translatedRows = singleSeries.data.rows.map((row) =>
      row.map((value) => tc(value)),
    );
    return {
      ...singleSeries,
      data: { ...singleSeries.data, rows: translatedRows },
    };
  });
};
