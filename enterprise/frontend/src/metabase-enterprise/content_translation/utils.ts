import * as I from "icepick";
import { useCallback, useMemo } from "react";
import _ from "underscore";

import type { ContentTranslationFunction } from "metabase/i18n/types";
import type { HoveredObject } from "metabase/visualizations/types";
import type {
  DictionaryArray,
  MaybeTranslatedSeries,
  RowValue,
  Series,
  SeriesSettings,
  VisualizationDisplay,
  VisualizationSettingKey,
  VisualizationSettings,
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

interface TranslationConfig<
  T extends VisualizationSettingKey = VisualizationSettingKey,
> {
  settingsKey: T;
  // Only translate if the value is not already in the settings
  isValueInSettings?: (
    settingsValue: VisualizationSettings[T],
    value: RowValue,
  ) => boolean;
  visualizationSettings: {
    updater: (
      settingsValue: VisualizationSettings[T],
      tc: ContentTranslationFunction,
    ) => VisualizationSettings[T];
  };
}

type SpecificTranslationConfig = {
  [K in VisualizationSettingKey]: TranslationConfig<K>;
}[VisualizationSettingKey];

const visualizationTranslationConfig: Partial<
  Record<VisualizationDisplay, SpecificTranslationConfig>
> = {
  pie: {
    settingsKey: "pie.rows",
    isValueInSettings: (pieRows = [], value) => {
      return pieRows.some((row) => row.originalName === value);
    },
    visualizationSettings: {
      updater: (pieRows, tc) => {
        if (!pieRows) {
          return pieRows;
        } else {
          return pieRows.map((row) => {
            return I.updateIn(row, ["name"], (name) => tc(name));
          });
        }
      },
    },
  },
  bar: {
    settingsKey: "series_settings",
    isValueInSettings: (seriesSettings = {}, value) => {
      return typeof value === "string" && value in seriesSettings;
    },
    visualizationSettings: {
      updater: (seriesSettings, tc) => {
        if (!seriesSettings) {
          return seriesSettings;
        } else {
          const newSetting = _.mapObject(seriesSettings, (value) => {
            return {
              ...value,
              title: tc(value.title),
            };
          }) as Record<string, SeriesSettings>;
          return newSetting;
        }
      },
    },
  },
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

    const translatedRows: RowValue[][] = singleSeries.data.rows.map((row) =>
      row.map((value) => {
        const translationConfig =
          visualizationTranslationConfig[singleSeries.card?.display];
        if (translationConfig?.isValueInSettings) {
          const setting: any =
            singleSeries.card.visualization_settings[
              translationConfig.settingsKey
            ];
          // Only translate if the value is not already in the settings
          return translationConfig.isValueInSettings(setting, value)
            ? value
            : tc(value);
        }

        return tc(value);
      }),
    );

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
  // const dictionary = useListContentTranslations();
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

    return translateFieldValuesInSeries(
      translateVizSettings(withTranslatedCardNames, tc),
      tc,
    );
  }, [series, tc]);
};

function translateVizSettings(
  series: Series,
  tc: ContentTranslationFunction,
): Series {
  return series.map((singleSeries) => {
    const translationConfig =
      visualizationTranslationConfig[singleSeries.card?.display];

    if (translationConfig) {
      return I.updateIn(
        singleSeries,
        ["card", "visualization_settings", translationConfig.settingsKey],
        (settings) =>
          translationConfig.visualizationSettings.updater(settings, tc),
      );
    }

    return singleSeries;
  });
}

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
