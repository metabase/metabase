import * as I from "icepick";
import _ from "underscore";

import type { ContentTranslationFunction } from "metabase-lib";
import type { DictionaryArray } from "metabase-types/api";

/** Translate a user-generated string
 *
 * Terminology: A "msgid" is a 'raw', untranslated string. A "msgstr" is a
 * translation of a msgid.
 * */
export const translateContentString = <
  MsgidType extends string | null | undefined,
>(
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
