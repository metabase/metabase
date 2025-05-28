import * as I from "icepick";
import _ from "underscore";

import type { HoveredObject } from "metabase/visualizations/types";
import type { ContentTranslationFunction } from "metabase-lib";
import type {
  DatasetColumn,
  DictionaryArray,
  Series,
} from "metabase-types/api";

/** Translate a user-generated string
 *
 * Terminology: A "msgid" is a 'raw', untranslated string. A "msgstr" is a
 * translation of a msgid.
 * */
export const translateContentString = <MsgidType = string | null | undefined>(
  dictionary: DictionaryArray | undefined,
  locale: string | undefined,
  /** This argument will be translated only if it is a string. If it is not a
   * string, it will be returned untranslated. */
  msgid: MsgidType,
) => {
  if (!locale) {
    return msgid;
  }

  if (typeof msgid !== "string") {
    return msgid;
  }

  if (!msgid.trim()) {
    return msgid;
  }

  const msgstr = dictionary?.find(
    (row) => row.locale === locale && row.msgid === msgid,
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
  const traverse = (o: T): T => {
    if (Array.isArray(o)) {
      return I.map(traverse, o) as T;
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

export const shouldTranslateFieldValuesOfColumn = (col: DatasetColumn) =>
  col.semantic_type === "type/Category" || col.semantic_type === "type/Country";

export const translateFieldValuesInHoveredObject = (
  obj: HoveredObject | null,
  tc?: ContentTranslationFunction,
) => {
  if (!tc) {
    return obj;
  }
  return {
    ...obj,
    data: obj?.data?.map((row) => {
      const { value, col } = row;

      return {
        ...row,
        value:
          col &&
          shouldTranslateFieldValuesOfColumn(col) &&
          typeof value === "string"
            ? tc(value)
            : value,
      };
    }),
  };
};

export const translateFieldValuesInSeries = (
  series: Series,
  tc: ContentTranslationFunction,
) => {
  return series.map((singleSeries) => {
    if (!singleSeries.data) {
      return singleSeries;
    }
    const { rows, cols } = singleSeries.data;
    const indexesOfColsToTranslate = cols.reduce<number[]>(
      (acc, col, index) =>
        shouldTranslateFieldValuesOfColumn(col) ? [...acc, index] : acc,
      [],
    );

    const translatedRows = rows.map((row) =>
      row.map((value, index) =>
        indexesOfColsToTranslate.includes(index) && typeof value === "string"
          ? tc(value)
          : value,
      ),
    );
    return {
      ...singleSeries,
      data: { ...singleSeries.data, rows: translatedRows },
    };
  });
};

export const translateSeries = (
  series: Series,
  tc: ContentTranslationFunction,
) => {
  const withTranslatedDisplayNames = translateDisplayNames(series, tc);

  // Do not translate field values here if display is a map, since this can
  // disrupt the map
  if (series?.[0]?.card?.display === "map") {
    return withTranslatedDisplayNames;
  }

  return translateFieldValuesInSeries(withTranslatedDisplayNames, tc);
};
